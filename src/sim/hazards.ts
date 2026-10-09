import { HAZARD } from '../config';
import { tileAt, type Room } from '../world/room';
import { burnNina, hurtNina, type Nina } from './nina';

const E = 0.05; // допуск: касание краем ровно по границе клетки не считается

function touches(n: Nina, room: Room, ch: string): boolean {
  const b = n.body;
  for (let r = Math.floor(b.y + E); r <= Math.floor(b.y + b.h - E); r++)
    for (let c = Math.floor(b.x + E); c <= Math.floor(b.x + b.w - E); c++)
      if (tileAt(room, c, r) === ch) return true;
  return false;
}

// Шипы `^` бьют как удар врага и подбрасывают назад; вода `~` жжёт медленно, без оглушения.
export function touchHazards(n: Nina, room: Room, dt: number): void {
  if (n.dead) return;
  if (touches(n, room, '^')) {
    const vx = n.body.vx;
    const dir: 1 | -1 = vx > 0.1 ? -1 : vx < -0.1 ? 1 : n.facing === 1 ? -1 : 1;
    if (hurtNina(n, HAZARD.spikeDamage, dir) && n.state !== 'ladder') {
      n.body.vy = -HAZARD.spikeBounce;
      n.body.onGround = false;
    }
  }
  if (touches(n, room, '~')) burnNina(n, HAZARD.waterDps * dt);
}
