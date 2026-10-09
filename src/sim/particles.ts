import { FX } from '../config';
import { PAL } from '../render/palette';

export type RGBA = readonly [number, number, number, number];

export interface Particle {
  ch: string;
  x: number; y: number; // центр символа
  vx: number; vy: number;
  t: number; life: number;
  gravity: number;
  size: number;
  color: RGBA;
}

export function stepParticles(ps: Particle[], dt: number): Particle[] {
  for (const p of ps) {
    p.t += dt;
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  return ps.filter(p => p.t < p.life);
}

export const particleAlpha = (p: Particle) => Math.max(0, 1 - p.t / p.life);

const SPARK = '*+.';

export function sparks(ps: Particle[], x: number, y: number, color: RGBA, n = FX.sparkCount, rng = Math.random): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng();
    const s = FX.sparkSpeed * (0.5 + rng());
    ps.push({ ch: SPARK[i % SPARK.length], x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: FX.sparkLife * (0.7 + 0.6 * rng()), gravity: 20, size: 0.5, color });
  }
}

// Символы фигуры разлетаются в сторону удара и падают.
export function crumble(ps: Particle[], glyphs: { x: number; y: number; ch: string; color: RGBA; size: number }[], dir: 1 | -1, rng = Math.random): void {
  for (const g of glyphs) {
    ps.push({
      ch: g.ch, x: g.x, y: g.y,
      vx: dir * (1 + 4 * rng()) + (rng() - 0.5) * 3,
      vy: -2 - 5 * rng(),
      t: 0, life: FX.crumbleLife * (0.75 + 0.5 * rng()),
      gravity: FX.crumbleGravity, size: g.size, color: g.color,
    });
  }
}

const SMOKE = '.,~';

// Дым: поднимается, медленно сносится вбок, тает (по мотивам smoke из ascii.rest).
export function smoke(ps: Particle[], x: number, y: number, n: number, rng = Math.random): void {
  for (let i = 0; i < n; i++) {
    ps.push({
      ch: SMOKE[Math.floor(rng() * SMOKE.length)], x: x + (rng() - 0.5) * 0.6, y,
      vx: (rng() - 0.5) * 0.8, vy: -FX.smokeRise * (0.7 + 0.6 * rng()),
      t: 0, life: FX.smokeLife * (0.8 + 0.4 * rng()), gravity: -0.3, size: 0.5, color: PAL.smoke,
    });
  }
}
