import { expect, it } from 'vitest';
import { HAZARD, NINA } from '../src/config';
import type { Room } from '../src/world/room';
import { loadRoomsFs, roomOf } from './helpers';
import { FALL_MAX, missionTargets, reachableNodes, routeDamage, targetDamage, unreachable, WATER_PER_CELL } from './reach';

// Точки посадки пролога: крыша и склон (x — левый край тела).
const LANDINGS = [{ room: 'roof-1', x: 8, bottom: 22 }, { room: 'slope-1', x: 2, bottom: 14 }];

// Комната с заменой клеток: [колонка, строка, символ].
const patch = (room: Room, cells: [number, number, string][], meta: Record<string, string> = room.meta): Room => {
  const tiles = room.tiles.map(row => [...row]);
  for (const [c, r, ch] of cells) tiles[r][c] = ch;
  return { ...room, meta, tiles: tiles.map(row => row.join('')) };
};
// Комнаты, где героиня может стоять, если выйти из starts.
const roomsReached = (rooms: Map<string, Room>, starts: { room: string; x: number; bottom: number }[]) =>
  new Set([...reachableNodes(rooms, starts)].filter(k => k.startsWith('S|')).map(k => k.split('|')[1]));

it('приёмка №3: с крыши и со склона достижимы 6 лент, ЭВМ, щиток, гараж и источник', () => {
  const rooms = loadRoomsFs();
  expect(missionTargets(rooms).map(t => t.what).sort()).toEqual([
    'ЭВМ', 'гараж', 'источник',
    'лента arch-1#t0', 'лента cave-3#t0', 'лента lab-3#t0', 'лента river-3#t0', 'лента roof-3#t0', 'лента store-3#t0',
    'щиток',
  ]);
  for (const s of LANDINGS) expect(unreachable(rooms, [s]), s.room).toEqual([]);
});

it('с крыши достижима каждая комната, кроме склона и леса — туда только ранним прыжком', () => {
  const rooms = loadRoomsFs();
  const early = ['forest-1', 'forest-2', 'forest-3', 'slope-1'];
  const all = [...rooms.keys()].filter(id => !id.startsWith('sea-') && !early.includes(id)).sort();
  expect([...roomsReached(rooms, [LANDINGS[0]])].sort()).toEqual(all);
});

// Односторонние спуски (трещины леса, провал острова, уступы двора) не запирают: отовсюду есть путь на крышу.
it('тупиков нет: из секретной, котельной, леса, грота, воды, двора и с камней есть путь на крышу', () => {
  const rooms = loadRoomsFs();
  const from = [
    { room: 'secret-1', x: 15, bottom: 22 }, { room: 'boiler', x: 4, bottom: 22 }, { room: 'slope-1', x: 33, bottom: 22 },
    { room: 'forest-2', x: 20, bottom: 22 }, { room: 'cave-in', x: 20, bottom: 22 }, { room: 'river-3', x: 20, bottom: 22 },
    { room: 'river-3', x: 3, bottom: 22 }, { room: 'yard', x: 30, bottom: 22 }, { room: 'river-2', x: 9.5, bottom: 22 },
    { room: 'river-1', x: 16, bottom: 22 },
  ];
  for (const s of from) expect(roomsReached(rooms, [s]).has('roof-1'), `${s.room} ${s.x},${s.bottom}`).toBe(true);
}, 20_000);

it('без лифта shaft-top низ с крыши недостижим', () => {
  const rooms = loadRoomsFs();
  const top = rooms.get('shaft-top')!;
  const { lift: _, ...meta } = top.meta;
  rooms.set('shaft-top', { ...top, meta });
  expect(unreachable(rooms, [LANDINGS[0]]).sort()).toEqual(['гараж', 'лента cave-3#t0', 'лента river-3#t0']);
});

it('фальш-пол и фальш-стена S проходимы, стена # — нет: заложены оба входа — источник недостижим', () => {
  const rooms = loadRoomsFs();
  const floor: [number, number, string][] = [];
  for (let c = 33; c <= 35; c++) for (let r = 22; r <= 24; r++) floor.push([c, r, '#']);
  rooms.set('store-2', patch(rooms.get('store-2')!, floor));
  expect(unreachable(rooms, LANDINGS)).toEqual([]); // через фальш-стену power-1
  rooms.set('power-1', patch(rooms.get('power-1')!, [18, 19, 20, 21].map(r => [0, r, '#'] as [number, number, string])));
  expect(unreachable(rooms, LANDINGS)).toEqual(['источник']);
});

// ---- модель: урон по маршруту ----

// Комнаты в ряд слева направо (или стопкой сверху вниз): id, строки сетки, шапка.
const strip = (dir: 'right' | 'down', parts: { id: string; rows: Record<number, string>; meta?: Record<string, string> }[]) => {
  const back = dir === 'right' ? 'left' : 'up';
  return new Map(parts.map((p, i) => {
    const exits: Room['exits'] = {};
    if (i > 0) exits[back] = parts[i - 1].id;
    if (i < parts.length - 1) exits[dir] = parts[i + 1].id;
    return [p.id, { ...roomOf(p.rows, exits), id: p.id, meta: p.meta ?? {} }];
  }));
};
// Коридор высотой в рост героини (прыгать некуда), пол — строка 22, вода `~` в колонках from..to.
const corridor = (from = 40, to = -1) => {
  const rows: Record<number, string> = {};
  for (let r = 0; r <= 17; r++) rows[r] = '#'.repeat(40);
  for (let r = 18; r <= 21; r++) rows[r] = Array.from({ length: 40 }, (_, c) => (c >= from && c <= to ? '~' : '.')).join('');
  rows[22] = '#'.repeat(40);
  return rows;
};

it('цена воды: клетка пути — HAZARD.waterDps / NINA.climbSpeed энергии', () => {
  expect(WATER_PER_CELL).toBeCloseTo(HAZARD.waterDps / NINA.climbSpeed);
  const rooms = strip('right', [{ id: 'a', rows: corridor(10, 19), meta: { tapes: '30,22' } }]);
  // тело в колонках c, c+1 мокнет на узлах c = 9..19 — 11 шагов в воде
  expect(targetDamage(rooms, [{ room: 'a', x: 2, bottom: 22 }]).get('лента a#t0')).toBeCloseTo(11 * WATER_PER_CELL);
});

it('река смертельна: брод в 100 клеток по коридору недостижим, в 60 — проходится', () => {
  const deadly = strip('right', [
    { id: 'a', rows: corridor(10, 39) }, { id: 'b', rows: corridor(0, 39) }, { id: 'c', rows: corridor(0, 29), meta: { tapes: '33,22' } },
  ]);
  expect(unreachable(deadly, [{ room: 'a', x: 2, bottom: 22 }])).toEqual(['лента c#t0']);
  const ford = strip('right', [
    { id: 'a', rows: corridor(10, 39) }, { id: 'b', rows: corridor() }, { id: 'c', rows: corridor(0, 29), meta: { tapes: '33,22' } },
  ]);
  expect(unreachable(ford, [{ room: 'a', x: 2, bottom: 22 }])).toEqual([]);
  expect(targetDamage(ford, [{ room: 'a', x: 2, bottom: 22 }]).get('лента c#t0')).toBeGreaterThan(60 * WATER_PER_CELL);
});

it('урон от падения по формуле NINA; падения копятся: три по 15 клеток подряд смертельны, хотя каждое не длиннее FALL_MAX', () => {
  expect(FALL_MAX).toBeGreaterThanOrEqual(15);
  const one = strip('down', [{ id: 'a', rows: { 5: '#'.repeat(20), 15: '.'.repeat(20) + '#'.repeat(20) }, meta: { tapes: '30,15' } }]);
  expect(targetDamage(one, [{ room: 'a', x: 2, bottom: 5 }]).get('лента a#t0')).toBeCloseTo((10 - NINA.safeFall) * NINA.fallDamagePerCell);
  // a: уступ 5 → уступ 20 (15 клеток); b: уступ 10 (15 клеток); дальше — пол b на 24 (14 клеток) или на 18 (8 клеток)
  const tower = (floor: number) => strip('down', [
    { id: 'a', rows: { 5: '#'.repeat(20), 20: '.'.repeat(20) + '#'.repeat(10) } },
    { id: 'b', rows: { 10: '.'.repeat(30) + '#'.repeat(10), [floor]: '#'.repeat(30) }, meta: { tapes: `10,${floor}` } },
  ]);
  const hurt = (k: number) => Math.max(0, k - NINA.safeFall) * NINA.fallDamagePerCell;
  expect(2 * hurt(15) + hurt(14)).toBeGreaterThanOrEqual(NINA.energyMax);
  expect(unreachable(tower(24), [{ room: 'a', x: 2, bottom: 5 }])).toEqual(['лента b#t0']);
  expect(targetDamage(tower(18), [{ room: 'a', x: 2, bottom: 5 }]).get('лента b#t0')).toBeCloseTo(2 * hurt(15));
});

// Модель урона на синтетических комнатах: одна комната 'test'.
const damageIn = (room: Room, from: { x: number; bottom: number }) => routeDamage(new Map([[room.id, room]]), [{ room: room.id, ...from }]);

it('прыжок: приземление ниже вершины дуги больше safeFall снимает энергию как падение', () => {
  // Уступ на строке 10 (колонки 0–5), пол на строке 17 только с колонки 14: шагом вниз не попасть, только прыжком с разбега.
  const room = roomOf({ 10: '######', 17: '#'.repeat(26).padStart(40, '.') });
  const got = damageIn(room, { x: 2, bottom: 10 });
  const floor = [...got].filter(([k]) => k.startsWith('S|test|') && k.endsWith('|17'));
  expect(floor.length).toBeGreaterThan(0);
  const apexDrop = 17 - (10 - NINA.jumpHeight);
  expect(apexDrop).toBeGreaterThan(NINA.safeFall);
  const fall = (apexDrop - NINA.safeFall) * NINA.fallDamagePerCell;
  for (const [k, d] of floor) expect(d, k).toBeGreaterThanOrEqual(fall - 0.5);
});

it('Дейкстра: узел пересчитывается, если сухой обход нашёлся позже дорогого падения', () => {
  // Со старта (уступ на строке 10) прямое падение у правого края даёт 11 клеток — 18 энергии; лесенка уступов влево
  // спускает на пол (строка 21) бесплатно. Прямое падение находится раньше (обход вправо идёт первым), сухой обход — позже и дешевле.
  const room = roomOf({ 10: '.'.repeat(31) + '######', 14: '.'.repeat(25) + '######', 21: '#'.repeat(40) });
  const got = damageIn(room, { x: 34, bottom: 10 });
  expect(got.get('S|test|37|21')).toBe(0);
});
