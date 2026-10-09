import { expect, it } from 'vitest';
import { DOG } from '../src/config';
import { DOG_BONES, DOG_JOINTS, DOG_POSES, dogGlyphs, dogPose } from '../src/anim/dog';
import { createDog } from '../src/sim/dog';

const dog = () => createDog('x', { kind: 'dog', x: 30, bottom: 23, patrol: [22, 37] });

it('скелет: 9 точек, у костей оба конца — точки', () => {
  expect(DOG_JOINTS).toHaveLength(9);
  for (const [a, b] of DOG_BONES) expect(a < 9 && b < 9).toBe(true);
  for (const p of Object.values(DOG_POSES)) expect(p).toHaveLength(18);
});

it('поза по состоянию: стоит, бежит (меняется с пройденным путём), прыгает', () => {
  const d = dog();
  expect(dogPose(d)).toEqual(DOG_POSES.stand);
  d.state = 'chase';
  d.body.vx = DOG.chaseSpeed;
  d.phase = 0.2;
  const a = dogPose(d);
  d.phase = 0.9;
  expect(dogPose(d)).not.toEqual(a);
  d.state = 'leap';
  expect(dogPose(d)).toEqual(DOG_POSES.leap);
});

it('символы собаки — над точкой опоры, в пределах роста', () => {
  const g = dogGlyphs(dog(), [1, 1, 1, 1]);
  expect(g.length).toBeGreaterThan(8);
  for (const s of g) {
    expect(s.y).toBeLessThanOrEqual(23 + 0.1);
    expect(s.y).toBeGreaterThan(23 - DOG.h - 0.6);
  }
});
