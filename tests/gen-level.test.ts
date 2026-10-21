import { describe, expect, it } from 'vitest';
import { BOMB, GEN, NINA } from '../src/config';
import { densityOf, doorCount, goalOf, loopsOf, roomsOf, tapesOf } from '../src/gen/difficulty';
import { generateLevel, type Level } from '../src/gen/level';
import { DOOR_COL, OPENING } from '../src/gen/templates';
import { doorsOf, keyDoor } from '../src/sim/doors';
import { validateRooms } from '../src/world';
import type { Dir, Room } from '../src/world/room';
import { parseCameras, parseEnemies, parseItems, parsePoints, parseTerminals } from '../src/world/spawns';
import { doorRoute, targetDamage, unreachable } from './reach';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const levels = new Map<number, Level>();
const level = (n: number) => levels.get(n) ?? levels.set(n, generateLevel(n)).get(n)!;

// Переходов от комнаты from; blocked(a, b) — выход закрыт.
function hops(rooms: Map<string, Room>, from: string, blocked: (a: string, b: string) => boolean = () => false): Map<string, number> {
  const d = new Map([[from, 0]]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    for (const to of Object.values(rooms.get(q[i])!.exits)) {
      if (to && !d.has(to) && !blocked(q[i], to)) {
        d.set(to, d.get(q[i])! + 1);
        q.push(to);
      }
    }
  }
  return d;
}
// Двери уровня: номер, комната с тайлами, сосед за ней.
const doorEdges = (rooms: Map<string, Room>) =>
  [...rooms.values()].flatMap(r => doorsOf(r).map(d => ({ n: d.n, room: r.id, other: r.exits[d.x === DOOR_COL.left ? 'left' : 'right']! })));
const cut = (edges: { room: string; other: string }[]) => (a: string, b: string) => edges.some(e => (e.room === a && e.other === b) || (e.room === b && e.other === a));
const goalRoom = (lv: Level) =>
  [...lv.rooms.values()].find(r => (lv.def.goal === 'bomb' ? !!r.meta.bomb : parseTerminals(r.meta.terminals, r.id).some(t => t.main)))!.id;
const enemiesOf = (rooms: Map<string, Room>) => [...rooms.values()].flatMap(r => parseEnemies(r.meta.enemies, r.id));

it('критерий 1: один номер — побитово один уровень', () => {
  for (const n of range(3, 30)) {
    const a = generateLevel(n), b = generateLevel(n);
    expect(JSON.stringify([...a.rooms], null, 0)).toBe(JSON.stringify([...b.rooms], null, 0));
    expect(a.def).toEqual(b.def);
    expect(a.attempt).toBe(b.attempt);
  }
});

it('критерий 2: уровни 3…100 собираются меньше чем за GEN.attempts попыток и проходят все проверки мира', () => {
  for (const n of range(3, 100)) {
    const lv = level(n);
    expect(lv.attempt, `уровень ${n}`).toBeLessThan(GEN.attempts);
    expect(validateRooms(lv.rooms, lv.def.goal, lv.def.start.room, { tapes: lv.def.tapes, sources: 0 }), `уровень ${n}`).toEqual([]);
  }
});

describe('критерий 3: полный поиск пути — все цели достижимы, урон среды не больше половины энергии', () => {
  for (const n of [...range(3, 12), 15, 20, 25, 30]) {
    it(`уровень ${n}`, { timeout: 120_000 }, () => {
      const lv = level(n), start = [lv.def.start], open = new Set([1, 2, 3]);
      expect(doorRoute(lv.rooms, start)).toEqual([]);
      expect(unreachable(lv.rooms, start, open)).toEqual([]);
      for (const [what, d] of targetDamage(lv.rooms, start, open)) expect(d, what).toBeLessThanOrEqual(NINA.energyMax / 2);
    });
  }
});

it('критерий 4: на bomb-уровнях отход от точки закладки к мотоциклу укладывается в долю отсчёта', () => {
  for (const n of range(3, 29).filter(x => x % 2)) {
    const lv = level(n);
    expect(hops(lv.rooms, goalRoom(lv)).get(lv.def.start.room)! * GEN.roomSec, `уровень ${n}`).toBeLessThanOrEqual(GEN.returnShare * BOMB.fuse);
  }
});

it('критерий 5: таблица сложности — комнаты, двери, ленты, цель, плотность врагов, что с какого уровня', () => {
  for (const n of [3, 4, 5, 8, 20]) {
    const lv = level(n), r = lv.rooms.size;
    expect(r, `уровень ${n}`).toBe(roomsOf(n));
    expect(doorEdges(lv.rooms)).toHaveLength(doorCount(n));
    expect(lv.def.goal).toBe(goalOf(n));
    const tapes = [...lv.rooms.values()].flatMap(x => parsePoints(x.meta.tapes, x.id, 'ленты')).length;
    expect(tapes).toBe(lv.def.goal === 'tapes' ? tapesOf(n) : 0);
    expect(lv.def.tapes).toBe(tapes);
    const foes = enemiesOf(lv.rooms).filter(e => e.kind !== 'flamer').length, d = densityOf(n);
    expect(foes, `уровень ${n}`).toBeGreaterThanOrEqual(Math.floor(d) * (r - 1));
    expect(foes, `уровень ${n}`).toBeLessThanOrEqual(Math.ceil(d) * (r - 1));
  }
  for (const n of range(3, 30)) {
    const kinds = new Set(enemiesOf(level(n).rooms).map(e => e.kind));
    const cams = [...level(n).rooms.values()].some(x => parseCameras(x.meta.cameras, x.id).length > 0);
    if (n < 4) expect(kinds.has('flamer'), `уровень ${n}`).toBe(false);
    if (n < 5) expect(kinds.has('guard'), `уровень ${n}`).toBe(false);
    if (n < 6) expect(cams, `уровень ${n}`).toBe(false);
  }
});

it('критерий 7: каждая дверь лежит на всех путях к цели; ключ k достижим без дверей ≥ k', () => {
  for (const n of range(3, 30)) {
    const lv = level(n), doors = doorEdges(lv.rooms), goal = goalRoom(lv);
    for (const d of doors) expect(hops(lv.rooms, lv.def.start.room, cut([d])).has(goal), `уровень ${n}, дверь ${d.n}`).toBe(false);
    for (const r of lv.rooms.values()) {
      for (const it of parseItems(r.meta.items, r.id)) {
        const k = keyDoor(it.kind);
        if (k) expect(hops(lv.rooms, lv.def.start.room, cut(doors.filter(d => d.n >= k))).has(r.id), `уровень ${n}, ключ ${k}`).toBe(true);
      }
    }
  }
});

it('ключ не в комнате с тайлами двери и минимум в двух переходах от комнаты своей двери', () => {
  for (const n of range(3, 100)) {
    const lv = level(n), doors = doorEdges(lv.rooms);
    for (const r of lv.rooms.values()) {
      for (const it of parseItems(r.meta.items, r.id)) {
        const k = keyDoor(it.kind);
        if (!k) continue;
        expect(doorsOf(r).length, `уровень ${n}, ключ ${k}`).toBe(0);
        const d = doors.find(e => e.n === k)!;
        expect(hops(lv.rooms, r.id).get(d.room)!, `уровень ${n}, ключ ${k}`).toBeGreaterThanOrEqual(2);
      }
    }
  }
});

it('петли: на уровнях 3…30 рёбер сверх дерева не меньше 70% от суммы loopsOf', () => {
  let placed = 0, asked = 0;
  for (const n of range(3, 30)) {
    const rooms = level(n).rooms;
    const exits = [...rooms.values()].reduce((s, r) => s + Object.values(r.exits).filter(Boolean).length, 0);
    placed += exits / 2 - (rooms.size - 1);
    asked += loopsOf(n);
  }
  expect(placed).toBeGreaterThanOrEqual(0.7 * asked);
});

it('критерий 8: таймер кратен 30 с и не короче 5 минут', () => {
  for (const n of range(3, 30)) {
    expect(level(n).def.time % 30).toBe(0);
    expect(level(n).def.time).toBeGreaterThanOrEqual(GEN.minTime);
  }
});

it('стартовая комната: шаблон start, мотоцикл, без врагов, ключей, лент и терминалов, выходы только right/down', () => {
  for (const n of range(3, 30)) {
    const lv = level(n), s = lv.rooms.get(lv.def.start.room)!;
    expect(s.meta.bike).toBeTruthy();
    expect(!!s.meta.fence).toBe(lv.def.goal === 'tapes');
    for (const key of ['enemies', 'cameras', 'items', 'tapes', 'terminals', 'switch', 'bomb']) expect(s.meta[key], `уровень ${n}: ${key}`).toBeUndefined();
    for (const d of Object.keys(s.exits)) expect(['right', 'down']).toContain(d);
  }
});

it('заделанные выходы — стена; у каждой роли — своя точка, двух записей на одной точке нет', () => {
  for (const n of range(3, 30)) {
    for (const r of level(n).rooms.values()) {
      for (const d of ['left', 'right', 'up', 'down'] as Dir[]) {
        if (r.exits[d]) continue;
        if (d === 'up' && r.id === level(n).def.start.room) continue; // над стартом небо
        for (const [c, row] of OPENING[d]) expect(r.tiles[row][c], `уровень ${n}, ${r.id}, ${d}`).toBe('#');
      }
      const pts = [
        ...parseItems(r.meta.items, r.id), ...parsePoints(r.meta.tapes, r.id, 'ленты'), ...parsePoints(r.meta.switch, r.id, 'щитка'),
        ...parsePoints(r.meta.bomb, r.id, 'точки закладки'), ...parseTerminals(r.meta.terminals, r.id),
      ].map(p => `${p.x},${p.bottom}`);
      expect(new Set(pts).size, `уровень ${n}, ${r.id}`).toBe(pts.length);
    }
  }
});
