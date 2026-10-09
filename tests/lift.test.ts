import { expect, it } from 'vitest';
import { LIFT } from '../src/config';
import { createLifts, liftRect, liftTop, nextStop, shaftRooms, stepLift } from '../src/sim/lift';
import { validateLifts } from '../src/world';
import type { Room } from '../src/world/room';
import { parseLift } from '../src/world/spawns';
import { FLOOR, roomOf } from './helpers';

// Шахта в колонках 18..20: этажи — полы «a» в строках 10 и 22 (с проёмом) и пол «b» в строке 22 (47 = 25 + 22).
const GAP = '#'.repeat(18) + '...' + '#'.repeat(19);
const world = (lift = '18 10..47 floors=22') => new Map<string, Room>([
  ['a', { ...roomOf({ 10: GAP, 22: GAP, 23: GAP, 24: GAP }, { down: 'b' }), id: 'a', meta: { lift } }],
  ['b', { ...roomOf({ 0: GAP, 22: FLOOR }, { up: 'a' }), id: 'b' }],
]);

it('parseLift: колонка, этажи по возрастанию; пусто — нет лифта', () => {
  expect(parseLift('18 10..47 floors=22', 'f')).toEqual({ x: 18, stops: [10, 22, 47] });
  expect(parseLift('5 14..22', 'f')).toEqual({ x: 5, stops: [14, 22] });
  expect(parseLift(undefined, 'f')).toBeNull();
  expect(parseLift('  ', 'f')).toBeNull();
});

it('parseLift: плохие записи — ошибка с именем файла', () => {
  for (const bad of ['18', '18 22..10', '18 10..22 floors=30', '18 10..22 floors=10', '38 10..22', 'x 10..22', '18 10..22 stops=12']) {
    expect(() => parseLift(bad, 'lab.txt'), bad).toThrow(/lab\.txt: плохая запись лифта/);
  }
});

it('shaftRooms: вниз по выходам down; в никуда — null', () => {
  const w = world();
  expect(shaftRooms(w, 'a', 47)).toEqual(['a', 'b']);
  expect(shaftRooms(w, 'a', 22)).toEqual(['a']);
  expect(shaftRooms(w, 'a', 25)).toEqual(['a', 'b']);
  expect(shaftRooms(w, 'b', 30)).toBeNull();
});

it('createLifts: лифт на верхнем этаже, верх платформы — в строках каждой комнаты шахты', () => {
  const [l] = createLifts(world());
  expect(l).toMatchObject({ id: 'a', x: 18, stops: [10, 22, 47], rooms: ['a', 'b'], y: 10, target: null });
  expect(liftTop(l, 'a')).toBe(10);
  expect(liftTop(l, 'b')).toBe(-15);
  expect(liftTop(l, 'zz')).toBeNull();
  l.y = 47;
  expect(liftRect(l, 'b')).toEqual({ x: 18, y: 22, w: 3, h: 1 });
});

it('nextStop: ближайший этаж выше и ниже', () => {
  const [l] = createLifts(world());
  expect(nextStop(l, 1)).toBe(22);
  expect(nextStop(l, -1)).toBeNull();
  l.y = 30;
  expect(nextStop(l, -1)).toBe(22);
  expect(nextStop(l, 1)).toBe(47);
});

it('stepLift: едет с постоянной скоростью, на этаже останавливается и стоит', () => {
  const [l] = createLifts(world());
  l.target = 22;
  stepLift(l, 0.5);
  expect(l.y).toBeCloseTo(10 + LIFT.speed * 0.5);
  for (let i = 0; i < 100 && l.target !== null; i++) stepLift(l, 0.1);
  expect(l.y).toBe(22);
  expect(l.target).toBeNull();
  expect(l.rest).toBe(LIFT.dwell);
  stepLift(l, 0.2);
  expect(l.y).toBe(22);
  expect(l.rest).toBeCloseTo(LIFT.dwell - 0.2);
});

it('validateLifts: шахта свободна — ошибок нет; стена в шахте, нет комнаты внизу, нет места над верхом — ошибки', () => {
  expect(validateLifts(world())).toEqual([]);
  const blocked = world();
  const b = blocked.get('b')!;
  blocked.set('b', { ...b, tiles: b.tiles.map((row, r) => (r === 5 ? row.slice(0, 19) + '#' + row.slice(20) : row)) });
  expect(validateLifts(blocked)).toEqual(['b: в шахте лифта a клетка 19,5 не пустая']);
  expect(validateLifts(world('18 10..60'))).toEqual(['a: шахта лифта уходит вниз в комнату, которой нет']);
  expect(validateLifts(world('18 3..22'))).toEqual(['a: над верхним этажом лифта нет места для героини']);
});
