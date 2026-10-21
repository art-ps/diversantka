import { expect, it } from 'vitest';
import { GEN } from '../src/config';
import { mulberry32, pick, seedOf, shuffle } from '../src/gen/rng';

it('mulberry32: один seed — одна последовательность, числа в [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const xs = Array.from({ length: 1000 }, () => a());
  expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
  for (const x of xs) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1);
  }
  expect(new Set(xs).size).toBeGreaterThan(990);
  expect(mulberry32(43)()).not.toBe(mulberry32(42)());
});

it('seedOf: зависит от номера уровня и попытки, целое без знака', () => {
  const seeds = new Set<number>();
  for (let n = 3; n < 40; n++) for (let a = 0; a < GEN.attempts; a++) seeds.add(seedOf(n, a));
  expect(seeds.size).toBe(37 * GEN.attempts);
  for (const s of seeds) {
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  }
  expect(seedOf(3, 0)).toBe(seedOf(3, 0));
});

it('pick и shuffle: только элементы входа, shuffle — перестановка на месте', () => {
  const rng = mulberry32(1);
  const xs = [1, 2, 3, 4, 5];
  for (let i = 0; i < 50; i++) expect(xs).toContain(pick(rng, xs));
  const ys = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(rng, ys);
  expect(out).toBe(ys);
  expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});
