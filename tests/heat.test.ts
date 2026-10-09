import { expect, it } from 'vitest';
import { HEAT_RATE, createHeat, heatLevel, stepHeat } from '../src/fx/heat';

const run = (f: ReturnType<typeof createHeat>, sec: number) => { for (let i = 0; i < Math.round(sec * 60); i++) stepHeat(f, 1 / 60); };
const levels = (f: ReturnType<typeof createHeat>, y: number) => Array.from({ length: f.w }, (_, x) => heatLevel(f, x, y));

it('горит: очаг белый, у дальнего края почти пусто, посередине языки', () => {
  const f = createHeat(16, 8, 6);
  run(f, 1);
  expect(Math.min(...levels(f, 7))).toBe(9);
  expect(levels(f, 3).some(v => v > 0)).toBe(true);
  expect(levels(f, 0).filter(v => v > 0).length).toBeLessThan(f.w / 2);
});

it('уровни — индексы в рампе 0..9', () => {
  const f = createHeat(8, 6, 4);
  run(f, 1);
  for (let y = 0; y < f.h; y++) for (const v of levels(f, y)) { expect(Number.isInteger(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(9); }
});

it('выключили — гаснет полностью за h+2 шага', () => {
  const f = createHeat(16, 6, 6);
  run(f, 1);
  f.on = false;
  for (let i = 0; i < f.h + 2; i++) stepHeat(f, 1 / HEAT_RATE);
  for (let y = 0; y < f.h; y++) expect(levels(f, y).every(v => v === 0)).toBe(true);
});

it('край очага (bed) холодный — там не горит', () => {
  const f = createHeat(4, 6, 6, [0, 1, 1, 0]);
  run(f, 1);
  expect(heatLevel(f, 0, 5)).toBe(0);
  expect(heatLevel(f, 1, 5)).toBe(9);
});

it('детерминизм: одинаковый seed — одинаковое поле', () => {
  const a = createHeat(10, 6, 6, undefined, 7), b = createHeat(10, 6, 6, undefined, 7);
  run(a, 0.7); run(b, 0.7);
  expect([...a.heat]).toEqual([...b.heat]);
});

it('шаги фиксированные: 1 кадр по 1/12 с = 2 шага по 1/24', () => {
  const a = createHeat(10, 6, 6), b = createHeat(10, 6, 6);
  stepHeat(a, 1 / 12);
  stepHeat(b, 1 / 24); stepHeat(b, 1 / 24);
  expect([...a.heat]).toEqual([...b.heat]);
});
