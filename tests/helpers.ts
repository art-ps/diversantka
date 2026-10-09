import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRoom, type Dir, type Room } from '../src/world/room';

export const FLOOR = '#'.repeat(40);

// Комната 40×25: незаданные строки — фон, короткие дополняются фоном.
export function roomOf(rows: Record<number, string>, exits: Partial<Record<Dir, string>> = {}): Room {
  const tiles = Array.from({ length: 25 }, (_, r) => (rows[r] ?? '').padEnd(40, '.').slice(0, 40));
  return { id: 'test', exits, meta: {}, tiles };
}

export function loadRoomsFs(): Map<string, Room> {
  const dir = fileURLToPath(new URL('../src/world/rooms', import.meta.url));
  const rooms = new Map<string, Room>();
  for (const f of readdirSync(dir).filter(n => n.endsWith('.txt'))) {
    const r = parseRoom(readFileSync(join(dir, f), 'utf8'), f);
    rooms.set(r.id, r);
  }
  return rooms;
}
