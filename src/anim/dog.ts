import type { Glyph } from '../render/figure';
import { boneGlyphs } from '../render/figure';
import type { Color } from '../render/glyphs';
import type { Dog } from '../sim/dog';

// Четвероногий скелет: x вперёд по взгляду, y вверх, клетки, (0,0) — земля под центром.
export const DOG_JOINTS = ['nose', 'head', 'withers', 'hips', 'tail', 'fPaw1', 'fPaw2', 'bPaw1', 'bPaw2'] as const;
export const DOG_BONES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [2, 6], [3, 7], [3, 8]];
export type DogPose = number[];

const P = (...xy: number[]): DogPose => xy;
// Нарисованы вручную: поджарая собака — лапы ~1.3 клетки, голова на шее выше спины, хвост вверх.
export const DOG_POSES = {
  stand: P(1.25, 1.55, 0.95, 1.75, 0.55, 1.3, -0.65, 1.25, -1.0, 1.65, 0.6, 0, 0.4, 0, -0.55, 0, -0.75, 0),
  runA: P(1.4, 1.45, 1.1, 1.65, 0.6, 1.25, -0.65, 1.2, -1.1, 1.5, 1.3, 0.2, 1.0, 0.05, -1.3, 0.2, -1.05, 0.05),
  runB: P(1.4, 1.45, 1.1, 1.65, 0.6, 1.25, -0.65, 1.2, -1.1, 1.5, 0.0, 0.15, 0.25, 0, -0.1, 0.2, -0.3, 0),
  leap: P(1.6, 1.75, 1.25, 1.9, 0.65, 1.45, -0.6, 1.3, -1.1, 1.6, 1.5, 0.9, 1.3, 0.7, -1.4, 0.6, -1.2, 0.4),
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
  // Дальние лапы (кости 5 и 7) тусклее; спина — одна линия.
  const out = boneGlyphs(points, DOG_BONES, color, k => k === 5 || k === 7);
  out.push({ x: points[1][0], y: points[1][1], ch: 'o', color, size: 0.7 });
  return out;
}
