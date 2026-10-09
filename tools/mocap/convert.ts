import { J, JOINTS, poseDistance, type Clip, type JointName, type Pose } from '../../src/anim/clip.ts';
import { framePositions, jointIndex, type Bvh, type Vec3 } from './bvh.ts';

export interface ClipSpec {
  name: string;
  source: string; // субъект_дубль CMU, например 16_35
  from: number; // первый кадр исходного файла (кадр 0 — нулевая поза, его не берём)
  to: number; // последний кадр включительно
  loop: boolean;
  anchor: 'floor' | 'root'; // floor — высота от земли; root — таз всегда на высоте покоя (прыжки, лестница)
  view?: 'side' | 'back'; // side (по умолчанию) — камера сбоку; back — камера за спиной (лестница)
}

export interface ConvertOpts { height: number; fps: number; legScale?: number }

export const CONTACT_H = 0.35; // стопа ниже этого (в клетках) — на земле
export const CONTACT_V = 3; // клеток/с — стопа на земле почти не движется относительно мира

// Какие точки BVH (CMU в конвертации cgspeed) соответствуют суставам скелета.
const SOURCE: Record<JointName, { joint: string; end?: boolean }> = {
  head: { joint: 'Head', end: true },
  neck: { joint: 'Neck1' },
  pelvis: { joint: 'Hips' },
  lShoulder: { joint: 'LeftArm' }, lElbow: { joint: 'LeftForeArm' }, lHand: { joint: 'LeftHand' },
  rShoulder: { joint: 'RightArm' }, rElbow: { joint: 'RightForeArm' }, rHand: { joint: 'RightHand' },
  lKnee: { joint: 'LeftLeg' }, lFoot: { joint: 'LeftFoot' },
  rKnee: { joint: 'RightLeg' }, rFoot: { joint: 'RightFoot' },
};

const round = (v: number) => Math.round(v * 1000) / 1000;

function points3d(bvh: Bvh, frame: number, idx: number[]): Vec3[] {
  const p = framePositions(bvh, frame);
  return JOINTS.map((n, i) => (SOURCE[n].end ? p.ends[idx[i]]! : p.joints[idx[i]]));
}

// Ноги короче: колено ближе к тазу, стопа ближе к колену — с сохранением направлений костей.
function shortenLegs(p: Vec3[], k: number): Vec3[] {
  if (k === 1) return p;
  const out = p.map(v => [...v] as Vec3);
  for (const [knee, foot] of [[J.lKnee, J.lFoot], [J.rKnee, J.rFoot]]) {
    for (let a = 0; a < 3; a++) {
      const k0 = p[J.pelvis][a] + (p[knee][a] - p[J.pelvis][a]) * k;
      out[foot][a] = k0 + (p[foot][a] - p[knee][a]) * k;
      out[knee][a] = k0;
    }
  }
  return out;
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function convertClip(bvh: Bvh, spec: ClipSpec, opts: ConvertOpts): Clip {
  if (spec.from < 1 || spec.to >= bvh.frames.length || spec.to <= spec.from) {
    throw new Error(`${spec.name}: диапазон ${spec.from}..${spec.to} вне файла из ${bvh.frames.length} кадров`);
  }
  const idx = JOINTS.map(n => jointIndex(bvh, SOURCE[n].joint));
  const legScale = opts.legScale ?? 1;
  const pts = (frame: number) => shortenLegs(points3d(bvh, frame, idx), legScale);

  // Кадр 0 — нулевая поза с прямыми ногами: по ней меряем рост и высоту таза.
  const rest = pts(0);
  const restFoot = Math.min(rest[J.lFoot][1], rest[J.rFoot][1]);
  const scale = opts.height / (rest[J.head][1] - restFoot);
  const restPelvis = rest[J.pelvis][1] - restFoot;

  // Доворот: лицом вперёд (+Z) по линии плеч на первом кадре клипа.
  const first = pts(spec.from);
  const lx = first[J.lShoulder][0] - first[J.rShoulder][0], lz = first[J.lShoulder][2] - first[J.rShoulder][2];
  const theta = Math.atan2(-lz, lx); // F = (−Lz, 0, Lx), θ = atan2(F.x, F.z)
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const turn = (p: Vec3): Vec3 => [p[0] * cos - p[2] * sin, p[1], p[0] * sin + p[2] * cos];

  // Пересэмплирование к opts.fps с линейной интерполяцией между исходными кадрами.
  const step = 1 / opts.fps / bvh.frameTime;
  const raw: Vec3[][] = [];
  for (let s = spec.from; s <= spec.to + 1e-9; s += step) {
    const a = Math.floor(s), t = s - a, b = Math.min(a + 1, spec.to);
    const pa = pts(a).map(turn), pb = pts(b).map(turn);
    raw.push(pa.map((p, i) => lerp3(p, pb[i], t)));
  }

  const rootZ = raw.map(f => f[J.pelvis][2]);
  const floor = Math.min(...raw.map(f => Math.min(f[J.lFoot][1], f[J.rFoot][1])));
  let frames: Pose[] = raw.map(f => {
    const pose: Pose = [];
    for (const p of f) {
      // side — камера сбоку, вперёд = +Z; back — камера за спиной: лево персонажа (+X) — лево экрана.
      const x = (spec.view === 'back' ? -(p[0] - f[J.pelvis][0]) : p[2] - f[J.pelvis][2]) * scale;
      const y = spec.anchor === 'floor' ? (p[1] - floor) * scale : (p[1] - f[J.pelvis][1] + restPelvis) * scale;
      pose.push(round(x), round(y));
    }
    return pose;
  });

  let end = frames.length - 1; // индекс кадра, до которого меряем путь
  if (spec.loop) {
    let best = Math.floor(frames.length / 2), bestD = Infinity;
    for (let j = Math.floor(frames.length / 2); j < frames.length; j++) {
      const d = poseDistance(frames[j], frames[0]);
      if (d < bestD) { bestD = d; best = j; }
    }
    end = best;
    frames = frames.slice(0, best); // кадр best совпадает с первым — цикл замыкается сам
  }

  const seconds = end / opts.fps;
  const speed = seconds > 0 && spec.view !== 'back' ? round((Math.abs(rootZ[end] - rootZ[0]) * scale) / seconds) : 0;

  // Контакт: стопа низко и почти неподвижна относительно мира (таз едет вперёд со скоростью speed).
  const n = frames.length;
  const near = (i: number) => (spec.loop ? (i + n) % n : Math.min(n - 1, Math.max(0, i)));
  const planted = (i: number, j: number) => {
    if (frames[i][2 * j + 1] >= CONTACT_H) return false;
    const a = near(i - 1), b = near(i + 1);
    const span = spec.loop ? 2 : b - a;
    const relV = span > 0 ? ((frames[b][2 * j] - frames[a][2 * j]) * opts.fps) / span : 0;
    return Math.abs(relV + speed) < CONTACT_V;
  };
  const contacts = frames.map((_, i) => {
    if (spec.anchor !== 'floor') return 0;
    return (planted(i, J.lFoot) ? 1 : 0) | (planted(i, J.rFoot) ? 2 : 0);
  });

  return { name: spec.name, fps: opts.fps, loop: spec.loop, speed, frames, contacts };
}
