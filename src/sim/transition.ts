import { ROOM_H, ROOM_W } from '../config';
import { tileAt, type Dir, type Room } from '../world/room';
import { isSolid, type Body } from './physics';

const EPS = 1e-6;

// Тело на месте (x, y) в комнате задевает стену.
function inWall(room: Room, b: Body, x: number, y: number): boolean {
  for (let r = Math.floor(y + EPS); r <= Math.floor(y + b.h - EPS); r++)
    for (let c = Math.floor(x + EPS); c <= Math.floor(x + b.w - EPS); c++) if (isSolid(tileAt(room, c, r))) return true;
  return false;
}

// next — соседняя комната по выходу: если тело оказалось бы в её стене, край работает как стена.
export function exitFor(b: Body, room: Room, next?: (id: string) => Room | undefined): { dir: Dir; to: string; dx: number; dy: number } | null {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dir: Dir | null = cx < 0 ? 'left' : cx >= ROOM_W ? 'right' : cy < 0 ? 'up' : cy >= ROOM_H ? 'down' : null;
  if (!dir) return null;
  const to = room.exits[dir];
  const dx = dir === 'left' ? ROOM_W : dir === 'right' ? -ROOM_W : 0;
  const dy = dir === 'up' ? ROOM_H : dir === 'down' ? -ROOM_H : 0;
  const other = to && next?.(to);
  if (!to || (other && inWall(other, b, b.x + dx, b.y + dy))) {
    // Выхода нет (или за краем стена) — край комнаты работает как стена.
    if (dir === 'left') { b.x = -b.w / 2; b.vx = 0; }
    if (dir === 'right') { b.x = ROOM_W - b.w / 2 - 1e-3; b.vx = 0; }
    if (dir === 'up') { b.y = -b.h / 2; b.vy = 0; }
    if (dir === 'down') { b.y = ROOM_H - b.h / 2 - 1e-3; b.vy = 0; }
    return null;
  }
  return { dir, to, dx, dy };
}
