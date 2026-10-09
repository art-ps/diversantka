import { expect, it } from 'vitest';
import { FIRE, FLAMER } from '../src/config';
import { fireCells, jetFire, pitFires, stepFires, type Fire } from '../src/fx/fires';
import { createFlamer, type Flamer } from '../src/sim/flamer';
import { FLOOR, roomOf } from './helpers';

const room = roomOf({ 21: '.'.repeat(10) + '^^^^' + '.'.repeat(6) + '^^', 22: FLOOR });
// stepHeat режет кадр до 0.25 с — шагаем мелко.
const run = (fires: Fire[], flamers: Flamer[], sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) stepFires(fires, flamers, 1 / 60); };

it('ямы: по отрезку `^` на строке, поле 2×len на 2×(1+pitRise)', () => {
  const pits = pitFires(room);
  expect(pits).toHaveLength(2);
  expect(pits[0]).toMatchObject({ kind: 'pit', x: 10, y: 22 });
  expect(pits[0].field.w).toBe(8);
  expect(pits[0].field.h).toBe(2 * (1 + FIRE.pitRise));
  expect(pits[1]).toMatchObject({ x: 20 });
});

it('огонь ямы — над своими клетками, не выше pitRise над тайлом', () => {
  const [pit] = pitFires(room);
  run([pit], [], 1);
  const cells = fireCells(pit);
  expect(cells.length).toBeGreaterThan(0);
  for (const c of cells) {
    expect(c.x).toBeGreaterThan(10);
    expect(c.x).toBeLessThan(14);
    expect(c.y).toBeLessThan(22);
    expect(c.y).toBeGreaterThan(21 - FIRE.pitRise);
  }
});

it('струя горит, только пока огнемёт включён, и догорает после', () => {
  const f = createFlamer('lab#e0', { kind: 'flamer', x: 38, y: 19, dir: -1 });
  const jet = jetFire(f);
  run([jet], [f], 0.5);
  expect(fireCells(jet)).toHaveLength(0); // пауза
  // огонь: держим фазу «on» полсекунды
  for (let i = 0; i < 30; i++) { f.t = FLAMER.off + 0.01; stepFires([jet], [f], 1 / 60); }
  const on = fireCells(jet);
  expect(on.length).toBeGreaterThan(0);
  for (const c of on) {
    expect(c.x).toBeLessThan(38); // струя влево от сопла
    expect(c.x).toBeGreaterThan(38 - FLAMER.length - 0.5);
  }
  for (let i = 0; i < 60; i++) { f.t = 0; stepFires([jet], [f], 1 / 60); }
  expect(fireCells(jet)).toHaveLength(0);
});
