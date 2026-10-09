import { expect, it } from 'vitest';
import { BONES, J, JOINTS, poseDistance, validateClip, type Clip } from '../src/anim/clip';

const pose = (v = 0) => Array.from({ length: 26 }, () => v);
const clip = (p: Partial<Clip> = {}): Clip => ({ name: 'idle', fps: 30, loop: true, speed: 0, frames: [pose()], contacts: [3], ...p });

it('13 суставов, у каждой кости оба конца — суставы', () => {
  expect(JOINTS).toHaveLength(13);
  expect(J.head).toBe(0);
  for (const [a, b] of BONES) expect(JOINTS).toContain(a), expect(JOINTS).toContain(b);
});

it('poseDistance — наибольшее расстояние между одноимёнными точками', () => {
  const b = pose();
  b[2 * J.lHand] = 3;
  b[2 * J.lHand + 1] = 4;
  expect(poseDistance(pose(), b)).toBeCloseTo(5);
});

it('validateClip: правильный клип без ошибок', () => {
  expect(validateClip(clip())).toEqual([]);
});

it('validateClip ловит пустые кадры, кривую длину позы, NaN и расхождение contacts', () => {
  expect(validateClip(clip({ frames: [] }))).toContain('idle: нет кадров');
  expect(validateClip(clip({ frames: [pose().slice(1)] }))).toContain('idle: кадр 0 — не 26 чисел');
  const bad = pose(); bad[5] = NaN;
  expect(validateClip(clip({ frames: [bad] }))).toContain('idle: кадр 0 — не 26 чисел');
  expect(validateClip(clip({ contacts: [] }))).toContain('idle: contacts не совпадает с числом кадров');
  expect(validateClip(clip({ fps: 0 }))).toContain('idle: fps должен быть > 0');
});
