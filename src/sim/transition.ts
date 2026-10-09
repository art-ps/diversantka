import { ROOM_H, ROOM_W } from '../config';
import type { Dir, Room } from '../world/room';
import type { Body } from './physics';

export function exitFor(b: Body, room: Room): { dir: Dir; to: string; dx: number; dy: number } | null {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dir: Dir | null = cx < 0 ? 'left' : cx >= ROOM_W ? 'right' : cy < 0 ? 'up' : cy >= ROOM_H ? 'down' : null;
  if (!dir) return null;
  const to = room.exits[dir];
  if (!to) {
    // Выхода нет — край комнаты работает как стена.
    if (dir === 'left') { b.x = -b.w / 2; b.vx = 0; }
    if (dir === 'right') { b.x = ROOM_W - b.w / 2 - 1e-3; b.vx = 0; }
    if (dir === 'up') { b.y = -b.h / 2; b.vy = 0; }
    if (dir === 'down') { b.y = ROOM_H - b.h / 2 - 1e-3; b.vy = 0; }
    return null;
  }
  return {
    dir, to,
    dx: dir === 'left' ? ROOM_W : dir === 'right' ? -ROOM_W : 0,
    dy: dir === 'up' ? ROOM_H : dir === 'down' ? -ROOM_H : 0,
  };
}
