import { DOG } from '../config';
import type { Room } from '../world/room';
import type { DogSpawn } from '../world/spawns';
import type { HitResult } from './android';
import type { Nina } from './nina';
import { moveX, moveY, type Body } from './physics';

export type DogState = 'patrol' | 'chase' | 'leap' | 'recoil' | 'dead';

export interface Dog {
  id: string;
  body: Body;
  facing: 1 | -1;
  patrol: [number, number];
  hp: number;
  state: DogState;
  t: number;
  cooldown: number;
  bit: boolean; // этот прыжок уже укусил
  gone: boolean; // рассыпалась — не рисуется
  phase: number; // пройденный путь — для анимации бега
}

const center = (b: Body) => b.x + b.w / 2;

export function createDog(id: string, s: DogSpawn): Dog {
  return {
    id, body: { x: s.x - DOG.w / 2, y: s.bottom - DOG.h, w: DOG.w, h: DOG.h, vx: 0, vy: 0, onGround: true },
    facing: 1, patrol: s.patrol, hp: DOG.hp, state: 'patrol', t: 0, cooldown: 0, bit: false, gone: false, phase: 0,
  };
}

function sees(d: Dog, n: Nina): boolean {
  if (n.dead) return false;
  const sameFloor = Math.abs(d.body.y + d.body.h - (n.body.y + n.body.h)) < DOG.floorTol;
  return sameFloor && Math.abs(center(n.body) - center(d.body)) <= DOG.sight;
}

// Горизонтальный сдвиг центра в пределах участка.
function slide(d: Dog, room: Room, dx: number): void {
  const c = center(d.body);
  const target = Math.min(Math.max(c + dx, d.patrol[0]), d.patrol[1]);
  moveX(d.body, room, target - c);
  d.phase += Math.abs(center(d.body) - c);
}

function setState(d: Dog, s: DogState): void {
  d.state = s;
  d.t = 0;
}

export function updateDog(d: Dog, n: Nina, room: Room, dt: number): void {
  if (d.state === 'dead') return;
  d.t += dt;
  d.cooldown = Math.max(0, d.cooldown - dt);
  const b = d.body;

  if (d.state === 'leap') {
    slide(d, room, b.vx * dt);
    const dy = b.vy * dt + 0.5 * DOG.gravity * dt * dt;
    b.vy += DOG.gravity * dt;
    if (moveY(b, room, dy) && b.onGround && d.t > 0.05) {
      b.vx = -d.facing * DOG.recoilSpeed;
      b.vy = 0;
      setState(d, 'recoil');
    }
    return;
  }
  if (d.state === 'recoil') {
    slide(d, room, b.vx * dt);
    if (d.t >= DOG.recoil) {
      b.vx = 0;
      d.cooldown = DOG.cooldown;
      setState(d, 'chase');
    }
    return;
  }

  const c0 = center(b);
  if (sees(d, n)) {
    d.state = 'chase';
    const dx = center(n.body) - center(b);
    if (Math.abs(dx) > 0.1) d.facing = dx >= 0 ? 1 : -1; // на крошечном dx не разворачиваться
    if (Math.abs(dx) <= DOG.leapRange && d.cooldown > 0) {
      b.vx = 0; // пауза после прыжка: держит дистанцию, не лезет в героиню
      return;
    }
    if (Math.abs(dx) <= DOG.leapRange) {
      b.vx = d.facing * DOG.leapVx;
      b.vy = DOG.leapVy;
      d.bit = false;
      setState(d, 'leap');
      return;
    }
    slide(d, room, d.facing * DOG.chaseSpeed * dt);
    b.vx = (center(b) - c0) / dt; // фактическая скорость — для позы бега
  } else {
    d.state = 'patrol';
    const c = center(b);
    if (c <= d.patrol[0] + 1e-6) d.facing = 1;
    else if (c >= d.patrol[1] - 1e-6) d.facing = -1;
    slide(d, room, d.facing * DOG.speed * dt);
    b.vx = (center(b) - c0) / dt;
  }
}

export function hitDog(d: Dog, dir: 1 | -1): HitResult {
  if (d.state === 'dead') return 'none';
  d.hp = 0;
  d.facing = dir > 0 ? -1 : 1;
  setState(d, 'dead');
  return 'killed';
}
