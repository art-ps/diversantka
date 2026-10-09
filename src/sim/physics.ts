import { tileAt, type Room } from '../world/room';

export interface Body {
  x: number; y: number; w: number; h: number;
  vx: number; vy: number;
  onGround: boolean;
}

export interface MoveOpts { ignoreOneWay?: boolean }

const EPS = 1e-6;
const STEP = 0.4; // меньше клетки: на любой скорости не перепрыгнуть тайл

export const isSolid = (t: string) => t === '#';
export const isLadder = (room: Room, col: number, row: number) => tileAt(room, col, row) === 'H';

// Платформа или верхняя клетка лестницы держат только сверху.
function isOneWayTop(room: Room, col: number, row: number): boolean {
  const t = tileAt(room, col, row);
  return t === '=' || (t === 'H' && tileAt(room, col, row - 1) !== 'H');
}

const colSpan = (b: Body) => [Math.floor(b.x + EPS), Math.floor(b.x + b.w - EPS)] as const;
const rowSpan = (b: Body) => [Math.floor(b.y + EPS), Math.floor(b.y + b.h - EPS)] as const;

export function moveX(b: Body, room: Room, dx: number): boolean {
  let left = dx;
  while (Math.abs(left) > EPS) {
    const step = Math.sign(left) * Math.min(STEP, Math.abs(left));
    const nx = b.x + step;
    const edge = step > 0 ? Math.floor(nx + b.w - EPS) : Math.floor(nx + EPS);
    const [r0, r1] = rowSpan(b);
    for (let r = r0; r <= r1; r++) {
      if (isSolid(tileAt(room, edge, r))) {
        b.x = step > 0 ? edge - b.w : edge + 1;
        b.vx = 0;
        return true;
      }
    }
    b.x = nx;
    left -= step;
  }
  return false;
}

export function moveY(b: Body, room: Room, dy: number, opts: MoveOpts = {}): boolean {
  b.onGround = false;
  let left = dy;
  while (Math.abs(left) > EPS) {
    const step = Math.sign(left) * Math.min(STEP, Math.abs(left));
    const ny = b.y + step;
    const [c0, c1] = colSpan(b);
    if (step > 0) {
      const oldBottom = b.y + b.h;
      const row = Math.floor(ny + b.h - EPS);
      for (let c = c0; c <= c1; c++) {
        const oneWay = !opts.ignoreOneWay && isOneWayTop(room, c, row) && oldBottom <= row + EPS;
        if (isSolid(tileAt(room, c, row)) || oneWay) {
          b.y = row - b.h;
          b.vy = 0;
          b.onGround = true;
          return true;
        }
      }
    } else {
      const row = Math.floor(ny + EPS);
      for (let c = c0; c <= c1; c++) {
        if (isSolid(tileAt(room, c, row))) {
          b.y = row + 1;
          b.vy = 0;
          return true;
        }
      }
    }
    b.y = ny;
    left -= step;
  }
  return false;
}
