import type { Glyph } from '../render/figure';
import { boneGlyphs } from '../render/figure';
import type { Color } from '../render/glyphs';
import type { Dog } from '../sim/dog';

// Четвероногий скелет: x вперёд по взгляду, y вверх, клетки, (0,0) — земля под центром.
export const DOG_JOINTS = ['nose', 'head', 'withers', 'hips', 'tail', 'fPaw1', 'fPaw2', 'bPaw1', 'bPaw2'] as const;
export const DOG_BONES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [2, 6], [3, 7], [3, 8]];
export type DogPose = number[];

const P = (...xy: number[]): DogPose => xy;
// Нарисованы вручную: рост собаки ~DOG.h.
export const DOG_POSES = {
  stand: P(1.1, 1.2, 0.8, 1.35, 0.5, 1.0, -0.6, 1.0, -1.0, 1.3, 0.6, 0, 0.4, 0, -0.5, 0, -0.7, 0),
  runA: P(1.2, 1.15, 0.9, 1.3, 0.5, 1.0, -0.6, 1.0, -1.1, 1.2, 1.0, 0.1, 0.2, 0.3, -0.2, 0.2, -1.0, 0),
  runB: P(1.2, 1.15, 0.9, 1.3, 0.5, 1.0, -0.6, 1.0, -1.1, 1.2, 0.3, 0.3, 0.9, 0, -1.0, 0.1, -0.3, 0.3),
  leap: P(1.4, 1.4, 1.05, 1.45, 0.6, 1.1, -0.6, 1.0, -1.2, 1.2, 1.3, 0.8, 1.1, 0.6, -1.2, 0.5, -1.0, 0.4),
};

const lerp = (a: DogPose, b: DogPose, t: number) => a.map((v, i) => v + (b[i] - v) * t);

export function dogPose(d: Dog): DogPose {
  if (d.state === 'leap') return DOG_POSES.leap;
  if (d.state === 'recoil' || Math.abs(d.body.vx) < 0.3) return DOG_POSES.stand;
  // Бег: туда-обратно между двумя позами по пройденному пути (шаг ~1.2 клетки).
  const s = (Math.sin((d.phase / 1.2) * Math.PI) + 1) / 2;
  return lerp(DOG_POSES.runA, DOG_POSES.runB, s);
}

export function dogGlyphs(d: Dog, color: Color): Glyph[] {
  const pose = dogPose(d);
  const x = d.body.x + d.body.w / 2, y = d.body.y + d.body.h;
  const points = DOG_JOINTS.map((_, j) => [x + d.facing * pose[2 * j], y - pose[2 * j + 1]] as const);
  // Дальние лапы (кости 5 и 7) тусклее, спина (кость 2) толще.
  const out = boneGlyphs(points, DOG_BONES, color, k => k === 5 || k === 7, k => k === 2);
  out.push({ x: points[1][0], y: points[1][1], ch: 'o', color, size: 0.7 });
  return out;
}
