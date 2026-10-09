import type { Clip, Pose } from './clip';

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return a.map((v, i) => v + (b[i] - v) * t);
}

// Цикл: после последнего кадра — снова первый; одноразовый клип держит последний кадр.
export function sampleClip(c: Clip, t: number): Pose {
  const n = c.frames.length;
  let f = t * c.fps;
  f = c.loop ? ((f % n) + n) % n : Math.min(Math.max(f, 0), n - 1);
  const i = Math.floor(f);
  const j = c.loop ? (i + 1) % n : Math.min(i + 1, n - 1);
  return lerpPose(c.frames[i], c.frames[j], f - i);
}
