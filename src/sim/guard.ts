import { createSimpleAnim, type SimpleAnim } from '../anim/simple';
import { GUARD } from '../config';
import type { Room } from '../world/room';
import type { GuardSpawn } from '../world/spawns';
import type { HitResult } from './android';
import { clearRow } from './doors';
import type { Projectile } from './items';
import type { Nina } from './nina';
import { moveX, type Body } from './physics';

// patrol/chase — ходит; back — шаг назад от героини перед выстрелом; aim — целится; reload — перезаряжается.
export type GuardState = 'patrol' | 'chase' | 'back' | 'aim' | 'reload' | 'hurt' | 'dead';

export interface Guard {
  id: string;
  body: Body;
  facing: 1 | -1;
  patrol: [number, number]; // границы, в которых держится центр тела
  hp: number;
  state: GuardState;
  t: number; // время в текущем состоянии
  moved: number; // пройдено назад в состоянии back, клетки
  invulnT: number;
  anim: SimpleAnim;
  gone: boolean; // рассыпался — не рисуется
}

const center = (b: Body) => b.x + b.w / 2;

export function createGuard(id: string, s: GuardSpawn): Guard {
  return {
    id,
    body: { x: s.x - GUARD.w / 2, y: s.bottom - GUARD.h, w: GUARD.w, h: GUARD.h, vx: 0, vy: 0, onGround: true },
    facing: 1, patrol: s.patrol, hp: GUARD.hp, state: 'patrol', t: 0, moved: 0, invulnT: 0, anim: createSimpleAnim(), gone: false,
  };
}

// Видит героиню на своём этаже на всю комнату, если на высоте груди между ними нет стены (закрытая дверь и опущенная
// решётка в solidRoom — тоже стена; фальш-стена «S» непрозрачна, как для камеры). Героиня в прыжке — не на этаже, не видна.
export function guardSees(gd: Guard, n: Nina, room: Room): boolean {
  if (n.dead || gd.state === 'dead') return false;
  const bottom = gd.body.y + gd.body.h;
  if (Math.abs(bottom - (n.body.y + n.body.h)) >= GUARD.floorTol) return false;
  return clearRow(room, center(gd.body), center(n.body), Math.floor(bottom - GUARD.chest));
}

function setState(gd: Guard, s: GuardState): void {
  gd.state = s;
  gd.t = 0;
  gd.body.vx = 0;
}

// Сдвиг центра на dir·speed·dt внутри участка; возвращает пройденное.
function walk(gd: Guard, room: Room, dir: 1 | -1, speed: number, dt: number): number {
  const c = center(gd.body);
  const target = Math.min(Math.max(c + dir * speed * dt, gd.patrol[0]), gd.patrol[1]);
  moveX(gd.body, room, target - c);
  gd.body.vx = (center(gd.body) - c) / dt;
  return Math.abs(center(gd.body) - c);
}

// Пуля — прямо по взгляду на высоте груди стоящей героини.
function bullet(gd: Guard): Projectile {
  const b = gd.body;
  return {
    kind: 'bullet', x: gd.facing > 0 ? b.x + b.w : b.x, y: b.y + b.h - GUARD.chest,
    vx: gd.facing * GUARD.bulletSpeed, vy: 0, from: 'enemy', damage: GUARD.bulletDamage, alive: true, hitWall: false,
  };
}

// alert — тревога в комнате: не видя героиню, идёт к ней по своему участку. Возвращает пулю в шаг выстрела.
export function updateGuard(gd: Guard, n: Nina, room: Room, dt: number, alert = false): Projectile | null {
  if (gd.state === 'dead') return null;
  gd.t += dt;
  gd.invulnT = Math.max(0, gd.invulnT - dt);

  if (gd.state === 'hurt') {
    if (gd.t >= GUARD.hurtStun) setState(gd, 'chase');
    return null;
  }
  if (gd.state === 'aim') {
    if (gd.t < GUARD.aim - 1e-9) return null;
    setState(gd, 'reload');
    return bullet(gd);
  }
  if (gd.state === 'reload') {
    if (gd.t < GUARD.reload - 1e-9) return null;
    setState(gd, 'chase');
  }
  if (gd.state === 'back') {
    // Шаг назад, не отворачиваясь; упёрся в стену или край участка — стреляет с места.
    const d = walk(gd, room, gd.facing === 1 ? -1 : 1, GUARD.backSpeed, dt);
    gd.moved += d;
    if (gd.moved >= GUARD.backStep - 1e-9 || d < 1e-6) setState(gd, 'aim');
    return null;
  }

  if (guardSees(gd, n, room)) {
    const dx = center(n.body) - center(gd.body);
    gd.facing = dx >= 0 ? 1 : -1;
    gd.moved = 0;
    setState(gd, Math.abs(dx) < GUARD.close ? 'back' : 'aim');
    return null;
  }
  if (alert && !n.dead) {
    gd.state = 'chase';
    const dx = center(n.body) - center(gd.body);
    if (Math.abs(dx) > 0.1) gd.facing = dx >= 0 ? 1 : -1;
    walk(gd, room, gd.facing, GUARD.chaseSpeed, dt);
    return null;
  }
  gd.state = 'patrol';
  const c = center(gd.body);
  if (c <= gd.patrol[0] + 1e-6) gd.facing = 1;
  else if (c >= gd.patrol[1] - 1e-6) gd.facing = -1;
  walk(gd, room, gd.facing, GUARD.speed, dt);
  return null;
}

// Удар героини: как по андроиду — неуязвимость после попадания, GUARD.hp попаданий — выведен.
export function hitGuard(gd: Guard, damage: number, dir: 1 | -1): HitResult {
  if (gd.state === 'dead') return 'none';
  if (gd.invulnT > 0) return 'blocked';
  gd.invulnT = GUARD.hitInvuln;
  gd.hp = Math.max(0, gd.hp - damage);
  setState(gd, gd.hp === 0 ? 'dead' : 'hurt');
  gd.facing = dir > 0 ? -1 : 1;
  return gd.hp === 0 ? 'killed' : 'hit';
}
