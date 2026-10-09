import { describe, expect, it } from 'vitest';
import { FX } from '../src/config';
import { crumble, particleAlpha, sparks, stepParticles, type Particle } from '../src/sim/particles';

const rng = () => 0.5;
const C = [1, 1, 1, 1] as const;

describe('частицы', () => {
  it('искры: заданное число, гаснут и исчезают', () => {
    let ps: Particle[] = [];
    sparks(ps, 10, 10, C, 6, rng);
    expect(ps).toHaveLength(6);
    expect(particleAlpha(ps[0])).toBe(1);
    ps = stepParticles(ps, FX.sparkLife / 2);
    expect(particleAlpha(ps[0])).toBeLessThan(1);
    ps = stepParticles(ps, FX.sparkLife);
    expect(ps).toHaveLength(0);
  });

  it('распад: по частице на символ, разлёт в сторону удара и падение', () => {
    let ps: Particle[] = [];
    crumble(ps, [{ x: 5, y: 5, ch: '|', color: C, size: 0.5 }, { x: 5, y: 6, ch: '/', color: C, size: 0.5 }], 1, rng);
    expect(ps.map(p => p.ch)).toEqual(['|', '/']);
    const y0 = ps[0].y;
    ps = stepParticles(ps, 0.5);
    expect(ps[0].x).toBeGreaterThan(5);
    expect(ps[0].vy).toBeGreaterThan(-100);
    ps = stepParticles(ps, 0.5);
    expect(ps[0].y).toBeGreaterThan(y0 - 5);
    ps = stepParticles(ps, FX.crumbleLife * 2);
    expect(ps).toHaveLength(0);
  });
});
