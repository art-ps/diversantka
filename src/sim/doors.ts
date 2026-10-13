import { ROOM_H, ROOM_W } from '../config';
import type { Room } from '../world/room';
import type { ItemKind, Point } from '../world/spawns';

// Тайлы дверей: «1», «2», «3» — запертая дверь N; для физики, пуль и лучей — стена, пока не открыта.
export const DOOR_TILES = '123';
export type DoorNo = 1 | 2 | 3;

// Дверь — непрерывный по вертикали столбец тайлов N: колонка x, строки top..bottom-1; bottom — пол под ней.
export interface Door { n: DoorNo; x: number; top: number; bottom: number }

// Открытая дверь в Mission.doorsOpen: «комната#N».
export const doorId = (room: string, n: number) => `${room}#${n}`;

// Ключ N открывает дверь N; любой другой предмет — ничего.
export const keyDoor = (kind: ItemKind | null): DoorNo | null => (kind === 'key1' ? 1 : kind === 'key2' ? 2 : kind === 'key3' ? 3 : null);

export function doorsOf(room: Room): Door[] {
  const out: Door[] = [];
  for (let c = 0; c < ROOM_W; c++) {
    for (let r = 0; r < ROOM_H; r++) {
      const t = room.tiles[r][c];
      if (!DOOR_TILES.includes(t)) continue;
      let e = r + 1;
      while (e < ROOM_H && room.tiles[e][c] === t) e++;
      out.push({ n: Number(t) as DoorNo, x: c, top: r, bottom: e });
      r = e - 1;
    }
  }
  return out;
}

// Куда подходить с ключом: середина проёма, на полу под дверью.
export const doorSpot = (d: Door): Point => ({ x: d.x + 0.5, bottom: d.bottom });

// Комната для физики, пуль и лучей: закрытая дверь — «#», открытая — фон «.». Без дверей — та же комната.
export function solidRoom(room: Room, open: ReadonlySet<string>): Room {
  if (!room.tiles.some(row => /[123]/.test(row))) return room;
  const tiles = room.tiles.map(row => row.replace(/[123]/g, t => (open.has(doorId(room.id, Number(t))) ? '.' : '#')));
  return { ...room, tiles };
}
