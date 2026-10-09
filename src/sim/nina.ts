import { COMBAT, NINA, type NinaConfig } from '../config';
import { IDLE, type Intent } from '../input/intent';
import { attackTotal, type Attack } from './combat';
import { tileAt, type Room } from '../world/room';
import type { ItemKind } from '../world/spawns';
import { isLadder, isSolid, moveX, moveY, type Body } from './physics';

export type NinaState = 'ground' | 'air' | 'ladder';

export interface Nina {
  body: Body;
  state: NinaState;
  facing: 1 | -1;
  crouching: boolean;
  energy: number;
  dead: boolean;
  attack: Attack | null;
  hurtT: number; // оглушение
  invulnT: number; // неуязвимость
  coyoteT: number;
  bufferT: number;
  jumpHeld: boolean;
  skid: boolean; // тормозной шаг после приземления без ввода
  peakY: number; // самая высокая точка текущего полёта — для урона от падения
  held: ItemKind | null; // предмет в руках
  throwT: number; // сколько ещё играет бросок
}

const EPS = 1e-6;

export function createNina(x: number, bottom: number, cfg: NinaConfig = NINA): Nina {
  const y = bottom - cfg.h;
  return {
    body: { x, y, w: cfg.w, h: cfg.h, vx: 0, vy: 0, onGround: false },
    state: 'air', facing: 1, crouching: false,
    energy: cfg.energyMax, dead: false, attack: null, hurtT: 0, invulnT: 0,
    coyoteT: 0, bufferT: 0, jumpHeld: false, skid: false, peakY: y, held: null, throwT: 0,
  };
}

const approach = (v: number, target: number, d: number) => (v < target ? Math.min(v + d, target) : Math.max(v - d, target));

function ladderInSpan(room: Room, col: number, b: Body): boolean {
  for (let r = Math.floor(b.y + EPS); r <= Math.floor(b.y + b.h - EPS); r++) if (isLadder(room, col, r)) return true;
  return false;
}

// Верхняя клетка непрерывной лестницы, начиная поиск от строки ног вверх.
function ladderTop(room: Room, col: number, fromRow: number): number {
  let r = fromRow;
  while (r >= 0 && !isLadder(room, col, r)) r--;
  while (r - 1 >= 0 && isLadder(room, col, r - 1)) r--;
  return r;
}

function headroom(room: Room, b: Body, fullH: number): boolean {
  const top = b.y + b.h - fullH;
  const c0 = Math.floor(b.x + EPS), c1 = Math.floor(b.x + b.w - EPS);
  for (let r = Math.floor(top + EPS); r <= Math.floor(b.y + EPS); r++) {
    for (let c = c0; c <= c1; c++) if (isSolid(tileAt(room, c, r))) return false;
  }
  return true;
}

export function updateNina(n: Nina, it: Intent, room: Room, dt: number, cfg: NinaConfig = NINA): void {
  if (n.dead) {
    // Мёртвое тело падает под гравитацией без ввода, пока не ляжет на пол.
    if (!n.body.onGround) {
      if (n.state === 'ladder') n.state = 'air';
      walk(n, IDLE, room, dt, cfg);
      n.energy = 0;
    }
    return;
  }
  n.invulnT = Math.max(0, n.invulnT - dt);
  n.throwT = Math.max(0, n.throwT - dt);
  if (n.hurtT > 0) {
    n.hurtT = Math.max(0, n.hurtT - dt);
    it = IDLE; // оглушена — ввод не слушается
  }
  if (n.attack) {
    n.attack.t += dt;
    const landed = n.attack.kind === 'flykick' && n.state !== 'air';
    if (n.attack.t >= attackTotal(n.attack.kind) || landed) n.attack = null;
  } else if (it.attackPressed && n.state !== 'ladder' && !n.crouching) {
    n.attack = { kind: n.state === 'air' ? 'flykick' : it.up ? 'kick' : 'punch', t: 0, hits: [] };
  }
  // Удар на земле: стоит, не прыгает и не лезет на лестницу.
  if (n.attack && n.attack.kind !== 'flykick') it = IDLE;
  const b = n.body;
  const col = Math.floor(b.x + b.w / 2);

  if (n.state !== 'ladder' && !n.crouching) {
    const canUp = it.up && ladderInSpan(room, col, b);
    const canDown = it.down && n.state === 'ground' && isLadder(room, col, Math.floor(b.y + b.h + EPS));
    if (canUp || canDown) {
      n.state = 'ladder';
      b.x = col + 0.5 - b.w / 2;
      b.vx = 0;
      b.vy = 0;
    }
  }

  if (n.state === 'ladder') {
    climb(n, it, room, dt, cfg, col);
  } else {
    walk(n, it, room, dt, cfg);
  }

  if (n.energy <= 0) {
    n.energy = 0;
    n.dead = true;
  }
}

function climb(n: Nina, it: Intent, room: Room, dt: number, cfg: NinaConfig, col: number): void {
  const b = n.body;
  n.peakY = b.y;
  if (it.jumpPressed) {
    n.state = 'air';
    b.vy = -Math.sqrt(2 * cfg.gravity * cfg.jumpHeight) * cfg.ladderJump;
    return;
  }
  if (it.up) {
    const top = ladderTop(room, col, Math.floor(b.y + b.h + EPS));
    const target = b.y - cfg.climbSpeed * dt;
    // Лестница, упёртая в верхний край комнаты, продолжается в комнате выше.
    if (top > 0 && target + b.h <= top) {
      b.y = top - b.h;
      b.onGround = true;
      n.state = 'ground';
    } else {
      moveY(b, room, target - b.y, { ignoreOneWay: true });
    }
  } else if (it.down) {
    if (moveY(b, room, cfg.climbSpeed * dt, { ignoreOneWay: true })) n.state = 'ground';
    else if (!ladderInSpan(room, col, b)) n.state = 'air';
  }
  n.peakY = b.y;
}

function walk(n: Nina, it: Intent, room: Room, dt: number, cfg: NinaConfig): void {
  const b = n.body;

  const wantCrouch = it.down && b.onGround;
  if (wantCrouch && !n.crouching) {
    b.y += cfg.h - cfg.crouchH;
    b.h = cfg.crouchH;
    n.crouching = true;
  } else if (!wantCrouch && n.crouching && headroom(room, b, cfg.h)) {
    b.y -= cfg.h - cfg.crouchH;
    b.h = cfg.h;
    n.crouching = false;
  }

  const target = n.crouching ? 0 : it.moveX * cfg.runSpeed;
  if (n.skid && (it.moveX !== 0 || b.vx === 0 || !b.onGround)) n.skid = false;
  const decel = n.skid ? cfg.landDecel : cfg.decelGround;
  const accel = b.onGround ? (target !== 0 ? cfg.accelGround : decel) : cfg.accelAir;
  b.vx = approach(b.vx, target, accel * dt);
  if (it.moveX !== 0) n.facing = it.moveX > 0 ? 1 : -1;
  moveX(b, room, b.vx * dt);

  n.coyoteT = b.onGround ? cfg.coyote : n.coyoteT - dt;
  n.bufferT = it.jumpPressed ? cfg.jumpBuffer : n.bufferT - dt;
  if (n.bufferT > 0 && n.coyoteT > 0 && !n.crouching) {
    b.vy = -Math.sqrt(2 * cfg.gravity * cfg.jumpHeight);
    n.bufferT = 0;
    n.coyoteT = 0;
    n.jumpHeld = true;
  }
  if (n.jumpHeld && (!it.jump || b.vy >= 0)) {
    if (b.vy < 0) b.vy *= cfg.jumpCut;
    n.jumpHeld = false;
  }

  // Точная формула для постоянного ускорения: высота прыжка не зависит от шага.
  const wasAir = n.state === 'air';
  const dy = b.vy * dt + 0.5 * cfg.gravity * dt * dt;
  b.vy = Math.min(b.vy + cfg.gravity * dt, cfg.maxFall);
  moveY(b, room, dy);

  if (b.onGround) {
    if (wasAir) {
      const fall = b.y - n.peakY;
      if (fall > cfg.safeFall) n.energy -= (fall - cfg.safeFall) * cfg.fallDamagePerCell;
      if (it.moveX === 0 && Math.abs(b.vx) > 0) n.skid = true;
    }
    n.state = 'ground';
    n.peakY = b.y;
    if (b.vx === 0 && it.moveX === 0) n.energy = Math.min(cfg.energyMax, n.energy + cfg.regenPerSec * dt);
  } else {
    n.state = 'air';
    n.peakY = Math.min(n.peakY, b.y);
  }
}

export function hurtNina(n: Nina, amount: number, dir: 1 | -1): boolean {
  if (n.invulnT > 0 || n.dead) return false;
  n.energy -= amount;
  n.hurtT = COMBAT.hurtStun;
  n.invulnT = COMBAT.hurtInvuln;
  n.body.vx = n.state === 'ladder' ? 0 : dir * COMBAT.hurtPush; // на лестнице не толкает
  n.attack = null;
  n.skid = false;
  if (n.energy <= 0) {
    n.energy = 0;
    n.dead = true;
  }
  return true;
}
