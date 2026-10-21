import { GEN } from '../config';

// Генератор уровня: [0, 1), один seed — одна последовательность (mulberry32).
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seed уровня n и попытки attempt: FNV-1a по версии генератора, номеру и попытке.
export function seedOf(n: number, attempt: number): number {
  let h = 2166136261;
  for (const v of [GEN.version, n, attempt]) h = Math.imul(h ^ v, 16777619) >>> 0;
  return h;
}

export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

// Перемешивание на месте (Фишер — Йейтс).
export function shuffle<T>(rng: Rng, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}
