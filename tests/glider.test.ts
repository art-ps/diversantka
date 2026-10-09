import { expect, it } from 'vitest';
import { NINA, PROLOGUE, ROOM_W } from '../src/config';
import { gliderAt, gliderHits, gliderRect, ROUTE, ROUTE_LEN } from '../src/sim/glider';
import { contains } from '../src/sim/rect';
import { loadRoomsFs } from './helpers';

it('путь: экран за экраном по 40 клеток, медленное снижение', () => {
  expect(gliderAt(0)).toEqual({ screen: 0, x: 0, bottom: PROLOGUE.bottomFrom });
  expect(gliderAt(39.9).screen).toBe(0);
  expect(gliderAt(40).screen).toBe(1);
  expect(gliderAt(125).screen).toBe(3);
  expect(gliderAt(125).x).toBeCloseTo(5);
  let prev = -Infinity;
  for (let d = 0; d < ROUTE_LEN; d += 0.5) {
    const a = gliderAt(d);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x).toBeLessThan(ROOM_W);
    expect(a.bottom).toBeGreaterThanOrEqual(prev);
    prev = a.bottom;
  }
  expect(prev).toBeLessThanOrEqual(PROLOGUE.bottomTo);
});

it('висящая Нина — внутри прямоугольника дельтаплана', () => {
  const a = gliderAt(50);
  const r = gliderRect(a);
  for (const [x, y] of [[a.x - NINA.w / 2, a.bottom - NINA.h], [a.x + NINA.w / 2 - 1e-3, a.bottom - 1e-3]]) expect(contains(r, x, y)).toBe(true);
});

it('на настоящей карте: над морем и склоном не задевает ничего, первый удар — о мачту на краю крыши', () => {
  const rooms = loadRoomsFs();
  for (const id of ROUTE) expect(rooms.has(id), id).toBe(true);
  let hit: number | null = null;
  for (let d = PROLOGUE.startD; d < ROUTE_LEN && hit === null; d += 0.1) {
    const a = gliderAt(d);
    if (gliderHits(rooms.get(ROUTE[a.screen])!, a)) hit = d;
  }
  expect(hit).not.toBeNull();
  const a = gliderAt(hit!);
  expect(ROUTE[a.screen]).toBe('roof-1');
  expect(a.x + PROLOGUE.span / 2).toBeGreaterThan(35.9); // мачта — колонка 36
  expect(a.x).toBeGreaterThan(30); // над крышей есть где отцепиться
});
