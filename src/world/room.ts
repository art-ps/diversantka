import { ROOM_H, ROOM_W } from '../config';

export type Dir = 'left' | 'right' | 'up' | 'down';
export const DIRS: Dir[] = ['left', 'right', 'up', 'down'];
export const OPPOSITE: Record<Dir, Dir> = { left: 'right', right: 'left', up: 'down', down: 'up' };

// # стена, = платформа (снизу проходима), H лестница, ~ вода, ^ опасность, . фон, S фальш-стена
export const TILE_CHARS = '#=H~^.S';

export interface Room {
  id: string;
  exits: Partial<Record<Dir, string>>;
  meta: Record<string, string>;
  tiles: string[];
}

export class RoomParseError extends Error {
  constructor(file: string, line: number, msg: string) {
    super(`${file}:${line}: ${msg}`);
  }
}

export function parseRoom(text: string, file = 'room'): Room {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sep = lines.indexOf('---');
  if (sep < 0) throw new RoomParseError(file, 1, 'нет разделителя ---');

  const head: Record<string, string> = {};
  for (let i = 0; i < sep; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const m = /^([a-z]+):\s*(.*)$/.exec(l);
    if (!m) throw new RoomParseError(file, i + 1, `строка шапки без «ключ: значение»: ${l}`);
    head[m[1]] = m[2];
  }
  if (!head.id) throw new RoomParseError(file, 1, 'нет id');

  const exits: Partial<Record<Dir, string>> = {};
  const exitsLine = lines.findIndex((l, i) => i < sep && l.trim().startsWith('exits:')) + 1 || 1;
  for (const part of (head.exits ?? '').split(/\s+/).filter(Boolean)) {
    const [k, v] = part.split('=');
    if (!DIRS.includes(k as Dir) || !v) throw new RoomParseError(file, exitsLine, `плохой выход: ${part}`);
    if (v !== '-') exits[k as Dir] = v;
  }

  const grid = lines.slice(sep + 1);
  while (grid.length && grid[grid.length - 1] === '') grid.pop();
  if (grid.length !== ROOM_H) throw new RoomParseError(file, sep + 2, `нужно ${ROOM_H} строк сетки, а их ${grid.length}`);
  grid.forEach((row, r) => {
    const ln = sep + 2 + r;
    if (row.length !== ROOM_W) throw new RoomParseError(file, ln, `нужно ${ROOM_W} символов, а их ${row.length}`);
    for (const ch of row) if (!TILE_CHARS.includes(ch)) throw new RoomParseError(file, ln, `неизвестный символ «${ch}»`);
  });

  const { id, exits: _exits, ...meta } = head;
  return { id, exits, meta, tiles: grid };
}

// За пределами комнаты — фон: так тела могут уйти в соседнюю комнату.
export function tileAt(room: Room, col: number, row: number): string {
  if (row < 0 || row >= ROOM_H || col < 0 || col >= ROOM_W) return '.';
  return room.tiles[row][col];
}

export function validateWorld(rooms: Map<string, Room>): string[] {
  const errors: string[] = [];
  for (const room of rooms.values()) {
    for (const d of DIRS) {
      const target = room.exits[d];
      if (!target) continue;
      const other = rooms.get(target);
      if (!other) {
        errors.push(`${room.id}: выход ${d} ведёт в несуществующую комнату ${target}`);
        continue;
      }
      if (other.exits[OPPOSITE[d]] !== room.id) {
        errors.push(`${room.id}: выход ${d} → ${target}, но у ${target} выход ${OPPOSITE[d]} не ведёт обратно`);
      }
    }
  }
  return errors;
}
