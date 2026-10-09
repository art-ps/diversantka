import { ANDROID } from '../config';
import type { Room } from '../world/room';
import type { EnemySpawn } from '../world/spawns';
import type { Projectile } from './items';
import type { Nina } from './nina';
import { moveX, type Body } from './physics';
import type { Rect } from './rect';

export type AndroidState = 'patrol' | 'chase' | 'throw' | 'punch' | 'hurt' | 'dead';

export interface Android {
  id: string;
  body: Body;
  facing: 1 | -1;
  patrol: [number, number]; // границы, в которых держится центр тела
  hp: number;
  state: AndroidState;
  t: number; // время в текущем состоянии
  cooldown: number;
  punchHit: boolean; // этот удар уже попал
  invulnT: number; // неуязвимость после попадания
}

const center = (b: Body) => b.x + b.w / 2;

export function createAndroid(id: string, s: EnemySpawn): Android {
  return {
    id,
    body: { x: s.x - ANDROID.w / 2, y: s.bottom - ANDROID.h, w: ANDROID.w, h: ANDROID.h, vx: 0, vy: 0, onGround: true },
    facing: 1, patrol: s.patrol, hp: ANDROID.hp, state: 'patrol', t: 0, cooldown: 0, punchHit: false, invulnT: 0,
  };
}

export function seesNina(a: Android, n: Nina): boolean {
  if (n.dead || a.state === 'dead') return false;
  const sameFloor = Math.abs(a.body.y + a.body.h - (n.body.y + n.body.h)) < ANDROID.floorTol;
  return sameFloor && Math.abs(center(n.body) - center(a.body)) <= ANDROID.sight;
}

function setState(a: Android, s: AndroidState): void {
  a.state = s;
  a.t = 0;
  a.body.vx = 0;
}

// Ходит только внутри своего участка: на другой этаж не уходит и с края не падает.
function walk(a: Android, room: Room, speed: number, dt: number): void {
  const c = center(a.body);
  const target = Math.min(Math.max(c + a.facing * speed * dt, a.patrol[0]), a.patrol[1]);
  moveX(a.body, room, target - c);
  a.body.vx = (center(a.body) - c) / dt;
}

function knife(a: Android): Projectile {
  const b = a.body;
  return {
    kind: 'knife', x: a.facing > 0 ? b.x + b.w : b.x, y: b.y + ANDROID.knifeHeight * b.h,
    vx: a.facing * ANDROID.knifeSpeed, vy: 0, from: 'enemy', damage: ANDROID.knifeDamage, alive: true,
  };
}

export function updateAndroid(a: Android, n: Nina, room: Room, dt: number): Projectile | null {
  if (a.state === 'dead') return null;
  a.t += dt;
  a.cooldown = Math.max(0, a.cooldown - dt);
  a.invulnT = Math.max(0, a.invulnT - dt);
  const p = ANDROID.punch;

  if (a.state === 'hurt') {
    if (a.t >= ANDROID.hurtStun) setState(a, 'chase');
    return null;
  }
  if (a.state === 'throw') {
    if (a.t < ANDROID.throwWindup) return null;
    a.cooldown = ANDROID.throwCooldown;
    const k = knife(a);
    setState(a, 'chase');
    return k;
  }
  if (a.state === 'punch') {
    if (a.t >= p.windup + p.active + p.recover) {
      a.cooldown = ANDROID.punchCooldown;
      setState(a, 'chase');
    }
    return null;
  }

  if (seesNina(a, n)) {
    a.state = 'chase';
    const dx = center(n.body) - center(a.body);
    a.facing = dx >= 0 ? 1 : -1;
    const dist = Math.abs(dx);
    if (dist <= ANDROID.meleeRange) {
      if (a.cooldown <= 0) {
        setState(a, 'punch');
        a.punchHit = false;
      }
    } else if (dist >= ANDROID.throwMin && a.cooldown <= 0) {
      setState(a, 'throw');
    } else {
      walk(a, room, ANDROID.chaseSpeed, dt);
    }
  } else {
    a.state = 'patrol';
    const c = center(a.body);
    if (c <= a.patrol[0] + 1e-6) a.facing = 1;
    else if (c >= a.patrol[1] - 1e-6) a.facing = -1;
    walk(a, room, ANDROID.speed, dt);
  }
  return null;
}

export function androidPunchBox(a: Android): Rect | null {
  const p = ANDROID.punch;
  // 1e-9: время копится суммой dt, 15 шагов по 1/60 дают 0.24999999999999997
  if (a.state !== 'punch' || a.t < p.windup - 1e-9 || a.t >= p.windup + p.active - 1e-9) return null;
  const b = a.body;
  return { x: a.facing > 0 ? b.x + b.w : b.x - p.reach, y: b.y + p.top * b.h, w: p.reach, h: (p.bottom - p.top) * b.h };
}

export function hitAndroid(a: Android, damage: number, dir: 1 | -1): void {
  if (a.state === 'dead' || a.invulnT > 0) return;
  a.invulnT = ANDROID.hitInvuln;
  a.hp -= damage;
  setState(a, a.hp <= 0 ? 'dead' : 'hurt');
  if (a.hp < 0) a.hp = 0;
  a.facing = dir > 0 ? -1 : 1; // разворачивается к ударившему
}
