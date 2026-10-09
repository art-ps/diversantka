import { expect, it } from 'vitest';
import type { Room } from '../src/world/room';
import { loadRoomsFs } from './helpers';
import { missionTargets, unreachable } from './reach';

// Точки посадки пролога: крыша и склон (x — левый край тела).
const LANDINGS = [{ room: 'roof-1', x: 8, bottom: 22 }, { room: 'slope-1', x: 2, bottom: 14 }];

// Комната с заменой клеток: [колонка, строка, символ].
const patch = (room: Room, cells: [number, number, string][], meta: Record<string, string> = room.meta): Room => {
  const tiles = room.tiles.map(row => [...row]);
  for (const [c, r, ch] of cells) tiles[r][c] = ch;
  return { ...room, meta, tiles: tiles.map(row => row.join('')) };
};

it('приёмка №3: с крыши и со склона достижимы 6 лент, ЭВМ, щиток, гараж и источник', () => {
  const rooms = loadRoomsFs();
  expect(missionTargets(rooms).map(t => t.what).sort()).toEqual([
    'ЭВМ', 'гараж', 'источник',
    'лента cave-1#t0', 'лента evm-1#t0', 'лента garage-1#t0', 'лента lab-1#t0', 'лента lab-2#t0', 'лента power-1#t0',
    'щиток',
  ]);
  for (const s of LANDINGS) expect(unreachable(rooms, [s]), s.room).toEqual([]);
});

it('без лестницы lab-2 → cave-1 пещера и источник недостижимы (в шахту — слишком высоко падать)', () => {
  const rooms = loadRoomsFs();
  const cave = rooms.get('cave-1')!;
  rooms.set('cave-1', patch(cave, Array.from({ length: 23 }, (_, r) => [19, r, '.'] as [number, number, string])));
  expect(unreachable(rooms, LANDINGS)).toEqual(['лента cave-1#t0', 'источник']);
});

it('платформа на 4 клетки выше пола — прыжком 3,5 не достать', () => {
  const rooms = loadRoomsFs();
  const evm = rooms.get('evm-1')!;
  const cells: [number, number, string][] = [];
  for (let c = 30; c <= 35; c++) cells.push([c, 11, '.'], [c, 10, '=']);
  rooms.set('evm-1', patch(evm, cells, { ...evm.meta, tapes: '33,10' }));
  expect(unreachable(rooms, LANDINGS)).toEqual(['лента evm-1#t0']);
});

it('без лифта power-1 → garage-1 гараж недостижим; фальш-стена S проходима, стена # — нет', () => {
  const rooms = loadRoomsFs();
  const power = rooms.get('power-1')!;
  const { lift: _, ...meta } = power.meta;
  rooms.set('power-1', { ...power, meta });
  expect(unreachable(rooms, LANDINGS)).toEqual(['лента garage-1#t0', 'гараж']);
  const walled = loadRoomsFs();
  const cave = walled.get('cave-1')!;
  walled.set('cave-1', patch(cave, [19, 20, 21, 22].map(r => [39, r, '#'] as [number, number, string])));
  expect(unreachable(walled, LANDINGS)).toEqual(['источник']);
});
