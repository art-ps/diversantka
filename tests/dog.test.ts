import { describe, expect, it } from 'vitest';
import { DOG, DT, NINA } from '../src/config';
import { IDLE } from '../src/input/intent';
import { createDog, hitDog, updateDog, type Dog } from '../src/sim/dog';
import { resolveDogs } from '../src/sim/fight';
import { createNina, updateNina, type Nina } from '../src/sim/nina';
import { FLOOR, roomOf } from './helpers';

const ROOM = roomOf({ 23: FLOOR, 15: '='.repeat(40) });
const center = (d: Dog) => d.body.x + d.body.w / 2;
const dog = (x = 30) => createDog('r#e0', { kind: 'dog', x, bottom: 23, patrol: [22, 37] });
const ninaAt = (x: number, bottom = 23): Nina => {
  const n = createNina(x, bottom);
  for (let i = 0; i < 3; i++) updateNina(n, IDLE, ROOM, DT);
  return n;
};

describe('собака', () => {
  it('патруль в пределах участка, не видит героиню на другом этаже', () => {
    const d = dog();
    const n = ninaAt(30, 15);
    for (let i = 0; i < 60 * 10; i++) {
      updateDog(d, n, ROOM, DT);
      expect(center(d)).toBeGreaterThanOrEqual(22 - 1e-6);
      expect(center(d)).toBeLessThanOrEqual(37 + 1e-6);
    }
    expect(['patrol']).toContain(d.state);
  });

  it('заметив, бежит быстрее героини и прыгает вблизи', () => {
    const d = dog(36);
    const n = ninaAt(24);
    updateDog(d, n, ROOM, DT);
    expect(d.state).toBe('chase');
    const x0 = center(d);
    updateDog(d, n, ROOM, DT);
    expect(x0 - center(d)).toBeCloseTo(DOG.chaseSpeed * DT, 3);
    for (let i = 0; i < 60 && d.state !== 'leap'; i++) updateDog(d, n, ROOM, DT);
    expect(d.state).toBe('leap');
  });

  it('прыжок: приземляется на пол, не выходит за участок, потом отскок и пауза', () => {
    const d = dog(23);
    const n = ninaAt(20.5);
    for (let i = 0; i < 60 && d.state !== 'leap'; i++) updateDog(d, n, ROOM, DT);
    for (let i = 0; i < 120 && d.state === 'leap'; i++) {
      updateDog(d, n, ROOM, DT);
      expect(center(d)).toBeGreaterThanOrEqual(22 - 1e-6);
      expect(d.body.y + d.body.h).toBeLessThanOrEqual(23 + 1e-6);
    }
    expect(d.state).toBe('recoil');
    expect(d.body.y + d.body.h).toBeCloseTo(23);
  });

  it('укус — один раз за прыжок', () => {
    const d = dog(26);
    const n = ninaAt(24);
    for (let i = 0; i < 120; i++) {
      updateDog(d, n, ROOM, DT);
      resolveDogs(n, [d], [], []);
      if (d.state === 'recoil') break;
    }
    expect(NINA.energyMax - n.energy).toBe(DOG.biteDamage);
  });

  it('гибнет с одного удара', () => {
    const d = dog();
    expect(hitDog(d, 1)).toBe('killed');
    expect(hitDog(d, 1)).toBe('none');
  });

  it('удар рукой стоя проходит над собакой, удар ногой попадает', () => {
    const attack = (kind: 'punch' | 'kick') => {
      const d = dog(26);
      d.state = 'recoil'; d.t = -10; // стоит на месте
      const n = ninaAt(24.2 - NINA.w);
      updateNina(n, { ...IDLE, attackPressed: true, up: kind === 'kick' }, ROOM, DT);
      for (let i = 0; i < 30; i++) {
        updateNina(n, IDLE, ROOM, DT);
        resolveDogs(n, [d], [], []);
      }
      return d.state;
    };
    expect(attack('punch')).not.toBe('dead');
    expect(attack('kick')).toBe('dead');
  });
});
