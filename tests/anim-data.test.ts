import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NINA } from '../src/config';
import { J, poseDistance, validateClip, type Clip } from '../src/anim/clip';

const NAMES = ['idle', 'walk', 'run', 'jump', 'fall', 'land', 'crouch', 'climb'];
const load = (n: string): Clip => JSON.parse(readFileSync(new URL(`../anim/${n}.json`, import.meta.url), 'utf8'));

describe('клипы anim/*.json', () => {
  it.each(NAMES)('%s существует и валиден', n => {
    expect(validateClip(load(n))).toEqual([]);
  });

  it.each(['idle', 'walk', 'run', 'climb'])('%s — цикл, стык не прыгает (< 0.6 клетки)', n => {
    const c = load(n);
    expect(c.loop).toBe(true);
    expect(poseDistance(c.frames[c.frames.length - 1], c.frames[0])).toBeLessThan(0.6);
  });

  it('рост в покое около NINA.h', () => {
    const y = load('idle').frames[0][2 * J.head + 1];
    expect(y).toBeGreaterThan(4.5);
    expect(y).toBeLessThan(6.5);
  });

  it('присед: голова в конце клипа не выше NINA.crouchH + 0.6', () => {
    const c = load('crouch');
    expect(c.frames[c.frames.length - 1][2 * J.head + 1]).toBeLessThanOrEqual(NINA.crouchH + 0.6);
  });

  it('скорости правдоподобны', () => {
    expect(load('idle').speed).toBeLessThan(1);
    expect(load('walk').speed).toBeGreaterThan(2);
    expect(load('walk').speed).toBeLessThan(8);
    expect(load('run').speed).toBeGreaterThan(5);
    expect(load('run').speed).toBeLessThan(16);
  });

  it('в беге обе стопы касаются земли', () => {
    const c = load('run');
    expect(c.contacts.some(b => b & 1)).toBe(true);
    expect(c.contacts.some(b => b & 2)).toBe(true);
  });

  it('стопа на земле в беге почти не скользит при движении со скоростью клипа', () => {
    const c = load('run');
    const dt = 1 / c.fps;
    for (const [bit, j] of [[1, J.lFoot], [2, J.rFoot]] as const) {
      let start: number | null = null;
      c.frames.forEach((p, i) => {
        if (!(c.contacts[i] & bit)) { start = null; return; }
        const world = p[2 * j] + c.speed * dt * i;
        if (start === null) start = world;
        expect(Math.abs(world - start)).toBeLessThan(0.5);
      });
    }
  });
});
