import { expect, it } from 'vitest';
import type { Room } from '../src/world/room';
import { loadRoomsFs } from './helpers';
import { missionTargets, reachableNodes, unreachable } from './reach';

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
    'лента arch-1#t0', 'лента cave-1#t0', 'лента garage-1#t0', 'лента lab-3#t0', 'лента roof-3#t0', 'лента store-3#t0',
    'щиток',
  ]);
  for (const s of LANDINGS) expect(unreachable(rooms, [s]), s.room).toEqual([]);
});

it('с крыши достижима каждая комната корпуса', () => {
  const rooms = loadRoomsFs();
  const all = [...rooms.keys()].filter(id => !id.startsWith('sea-')).sort();
  expect([...roomsReached(rooms, [LANDINGS[0]])].sort()).toEqual(all);
});

it('тупиков нет: из секретной, котельной, пещеры и гаража есть путь назад на крышу', () => {
  const rooms = loadRoomsFs();
  for (const s of [{ room: 'secret-1', x: 15, bottom: 22 }, { room: 'boiler', x: 4, bottom: 22 }, { room: 'cave-1', x: 3, bottom: 23 }, { room: 'garage-1', x: 26.9, bottom: 22 }]) {
    expect(roomsReached(rooms, [s]).has('roof-1'), s.room).toBe(true);
  }
});

it('без лифта shaft-top пещера и гараж недостижимы', () => {
  const rooms = loadRoomsFs();
  const top = rooms.get('shaft-top')!;
  const { lift: _, ...meta } = top.meta;
  rooms.set('shaft-top', { ...top, meta });
  expect(unreachable(rooms, LANDINGS)).toEqual(['лента cave-1#t0', 'лента garage-1#t0', 'гараж']);
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
