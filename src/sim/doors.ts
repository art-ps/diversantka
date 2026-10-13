import { ROOM_H, ROOM_W } from '../config';
import { tileAt, type Room } from '../world/room';
import type { ItemKind, Point } from '../world/spawns';
import { isSolid, type Body } from './physics';

// Тайлы дверей: «1», «2», «3» — запертая дверь N; для физики, пуль и лучей — стена, пока не открыта.
export const DOOR_TILES = '123';
export type DoorNo = 1 | 2 | 3;

// Дверь — непрерывный по вертикали столбец тайлов N: колонка x, строки top..bottom-1; bottom — пол под ней.
export interface Door { n: DoorNo; x: number; top: number; bottom: number }

// Открытая дверь в Mission.doorsOpen: «комната#N».
export const doorId = (room: string, n: number) => `${room}#${n}`;

// Ключ N открывает дверь N; любой другой предмет — ничего.
export const keyDoor = (kind: ItemKind | null): DoorNo | null => (kind === 'key1' ? 1 : kind === 'key2' ? 2 : kind === 'key3' ? 3 : null);

// Решётка — непрерывный по вертикали столбец тайлов «A»: колонка x, строки top..bottom-1.
export interface Gate { x: number; top: number; bottom: number }

// Непрерывные по вертикали столбцы одного символа из chars: колонка, строки top..bottom-1.
function columns(room: Room, chars: string): { t: string; x: number; top: number; bottom: number }[] {
  const out: { t: string; x: number; top: number; bottom: number }[] = [];
  for (let c = 0; c < ROOM_W; c++) {
    for (let r = 0; r < ROOM_H; r++) {
      const t = room.tiles[r][c];
      if (!chars.includes(t)) continue;
      let e = r + 1;
      while (e < ROOM_H && room.tiles[e][c] === t) e++;
      out.push({ t, x: c, top: r, bottom: e });
      r = e - 1;
    }
  }
  return out;
}

export const doorsOf = (room: Room): Door[] => columns(room, DOOR_TILES).map(({ t, ...d }) => ({ n: Number(t) as DoorNo, ...d }));
export const gatesOf = (room: Room): Gate[] => columns(room, 'A').map(({ t: _t, ...s }) => s);

// Сколько верхних строк решётки уже стена при опускании gate (0 — поднята, 1 — опущена).
export const gateRows = (s: Gate, gate: number) => Math.ceil(gate * (s.bottom - s.top) - 1e-9);

// Куда подходить с ключом: середина проёма, на полу под дверью.
export const doorSpot = (d: Door): Point => ({ x: d.x + 0.5, bottom: d.bottom });

// Комната для физики, пуль и лучей: закрытая дверь — «#», открытая — фон «.»; решётка — «#» в опущенных строках
// (gate — доля опускания), иначе фон. Без дверей и решёток — та же комната.
export function solidRoom(room: Room, open: ReadonlySet<string>, gate = 0): Room {
  if (!room.tiles.some(row => /[123A]/.test(row))) return room;
  const down = new Set<string>();
  for (const s of gatesOf(room)) for (let r = s.top; r < s.top + gateRows(s, gate); r++) down.add(`${s.x},${r}`);
  const tiles = room.tiles.map((row, r) =>
    row.replace(/[123A]/g, (t, c: number) => (t === 'A' ? (down.has(`${c},${r}`) ? '#' : '.') : open.has(doorId(room.id, Number(t))) ? '.' : '#')));
  return { ...room, tiles };
}

// В строке row между колонками x0 и x1 нет стены и фальш-стены «S» — прямая видимость и удар по горизонтали.
// room — из solidRoom: закрытая дверь и опущенная решётка там уже «#».
export function clearRow(room: Room, x0: number, x1: number, row: number): boolean {
  const a = Math.floor(x0), b = Math.floor(x1);
  for (let c = Math.min(a, b); c <= Math.max(a, b); c++) if (isSolid(tileAt(room, c, row)) || tileAt(room, c, row) === 'S') return false;
  return true;
}

// Тело на месте x задевает стену комнаты.
function blockedAt(room: Room, b: Body, x: number): boolean {
  for (let r = Math.floor(b.y + 1e-6); r <= Math.floor(b.y + b.h - 1e-6); r++)
    for (let c = Math.floor(x + 1e-6); c <= Math.floor(x + b.w - 1e-6); c++) if (isSolid(tileAt(room, c, r))) return true;
  return false;
}

// Опущенная часть решётки s (k строк сверху) задела тело — вытолкнуть в сторону, откуда шло: против скорости,
// стоя — за спину (против facing); там стена — в другую сторону. room — комната с опущенной решёткой (solidRoom).
export function pushFromGate(b: Body, facing: 1 | -1, s: Gate, k: number, room: Room): void {
  if (k <= 0 || b.x >= s.x + 1 || b.x + b.w <= s.x || b.y >= s.top + k || b.y + b.h <= s.top) return;
  const back: 1 | -1 = b.vx > 0.1 ? -1 : b.vx < -0.1 ? 1 : facing === 1 ? -1 : 1;
  const to = (d: 1 | -1) => (d < 0 ? s.x - b.w - 1e-3 : s.x + 1 + 1e-3);
  b.x = blockedAt(room, b, to(back)) ? to(back === 1 ? -1 : 1) : to(back);
  b.vx = 0;
}
