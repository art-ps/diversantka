import { expect, it } from 'vitest';
import { COMBAT, DT, HAZARD, NINA } from '../src/config';
import { IDLE } from '../src/input/intent';
import { touchHazards } from '../src/sim/hazards';
import { createNina, updateNina, type Nina } from '../src/sim/nina';
import type { Room } from '../src/world/room';
import { FLOOR, roomOf } from './helpers';

// Пол — строка 22, шипы/вода — строка 21, колонки 10..13.
const room = (ch: string) => roomOf({ 21: '.'.repeat(10) + ch.repeat(4), 22: FLOOR });
const tick = (n: Nina, r: Room, ticks: number) => {
  for (let i = 0; i < ticks; i++) { updateNina(n, IDLE, r, DT); touchHazards(n, r, DT); }
};
const settled = (x: number) => { const n = createNina(x, 22); tick(n, roomOf({ 22: FLOOR }), 5); return n; };

it('шипы: удар — урон, оглушение, подброс вверх', () => {
  const r = room('^');
  const n = settled(11);
  touchHazards(n, r, DT);
  expect(n.energy).toBe(NINA.energyMax - HAZARD.spikeDamage);
  expect(n.hurtT).toBeGreaterThan(0);
  expect(n.body.vy).toBeLessThan(0);
  updateNina(n, IDLE, r, DT);
  expect(n.state).toBe('air');
});

it('шипы: стоя на них, урон не чаще раза за окно неуязвимости', () => {
  const r = room('^');
  const n = settled(11);
  tick(n, r, Math.floor((COMBAT.hurtInvuln - 0.05) / DT));
  expect(NINA.energyMax - n.energy).toBeGreaterThan(HAZARD.spikeDamage - NINA.regenPerSec * COMBAT.hurtInvuln);
  expect(NINA.energyMax - n.energy).toBeLessThanOrEqual(HAZARD.spikeDamage);
});

it('вплотную к шипам — без урона', () => {
  const r = room('^');
  const n = settled(10 - NINA.w); // правый край тела ровно на границе колонки 10
  touchHazards(n, r, DT);
  expect(n.energy).toBe(NINA.energyMax);
});

it('вода: медленный урон без оглушения', () => {
  const r = room('~');
  const n = settled(11);
  tick(n, r, Math.round(1 / DT));
  const lost = NINA.energyMax - n.energy;
  expect(lost).toBeGreaterThan(HAZARD.waterDps - NINA.regenPerSec - 1);
  expect(lost).toBeLessThanOrEqual(HAZARD.waterDps + 0.5);
  expect(n.hurtT).toBe(0);
});
