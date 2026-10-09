import { ANIM } from '../config';
import type { Nina, NinaState } from '../sim/nina';
import type { Clip, Pose } from './clip';
import { lerpPose, sampleClip } from './pose';

export const ANIM_NAMES = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'crouch', 'climb'] as const;
export type AnimName = (typeof ANIM_NAMES)[number];

export interface Animator {
  clip: AnimName;
  t: number; // время внутри клипа, с
  from: Pose | null; // поза, из которой идёт переход
  fadeT: number;
  landT: number;
  prevState: NinaState;
  peakY: number; // верхняя точка полёта — решает, играть ли приземление
  lastY: number;
}

export function createAnimator(): Animator {
  return { clip: 'idle', t: 0, from: null, fadeT: ANIM.fade, landT: 0, prevState: 'ground', peakY: 0, lastY: 0 };
}

export function chooseClip(n: Nina, a: Animator): AnimName {
  if (n.state === 'ladder') return 'climb';
  if (n.state === 'air') return n.body.vy < 0 ? 'jump' : 'fall';
  if (n.crouching) return 'crouch';
  if (a.landT > 0) return 'land';
  const s = Math.abs(n.body.vx);
  if (s < ANIM.moveEps) return 'idle';
  return s < ANIM.walkBelow ? 'walk' : 'run';
}

export function currentPose(a: Animator, clips: Map<string, Clip>): Pose {
  const pose = sampleClip(clips.get(a.clip)!, a.t);
  return a.from && a.fadeT < ANIM.fade ? lerpPose(a.from, pose, a.fadeT / ANIM.fade) : pose;
}

export function updateAnimator(a: Animator, n: Nina, clips: Map<string, Clip>, dt: number): void {
  const y = n.body.y;
  if (n.state === 'air') {
    a.peakY = a.prevState === 'air' ? Math.min(a.peakY, y) : y;
  }
  if (a.prevState === 'air' && n.state === 'ground' && y - a.peakY >= ANIM.landMinFall) a.landT = ANIM.landTime;
  else a.landT = Math.max(0, a.landT - dt);
  a.prevState = n.state;

  const next = chooseClip(n, a);
  if (next !== a.clip) {
    a.from = currentPose(a, clips);
    a.fadeT = 0;
    a.clip = next;
    a.t = 0;
  }

  const c = clips.get(a.clip)!;
  if ((a.clip === 'walk' || a.clip === 'run') && c.speed > 0) {
    // Фаза по пройденному пути: стопа на земле стоит на месте при любой скорости бега.
    a.t += (Math.abs(n.body.vx) * dt) / c.speed;
  } else if (a.clip === 'climb') {
    // Вверх — клип вперёд, вниз — назад: руки и ноги перехватывают в правильную сторону.
    if (y < a.lastY) a.t += dt;
    else if (y > a.lastY) a.t -= dt;
  } else {
    a.t += dt;
  }
  a.fadeT += dt;
  a.lastY = y;
}
