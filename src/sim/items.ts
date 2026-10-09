import { COMBAT, ROOM_H, ROOM_W } from '../config';
import type { Intent } from '../input/intent';
import { tileAt, type Room } from '../world/room';
import type { ItemKind } from '../world/spawns';
import type { Nina } from './nina';
import { isSolid } from './physics';
import { bodyRect, contains, overlap, type Rect } from './rect';

export interface Item { id: string; kind: ItemKind; x: number; bottom: number }

export interface Projectile {
  kind: ItemKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  from: 'nina' | 'enemy';
  damage: number; // по андроиду — попадания; по героине — энергия
  alive: boolean;
}

export const itemRect = (i: Item): Rect => ({ x: i.x - 0.5, y: i.bottom - 1, w: 1, h: 1 });

// Кнопка броска: с пустыми руками подбирает предмет под ногами, с предметом — бросает.
export function useThrowButton(n: Nina, it: Intent, items: Item[]): { picked?: Item; thrown?: Projectile } {
  if (!it.throwPressed || n.dead || n.hurtT > 0 || n.state === 'ladder') return {};
  if (!n.held) {
    const r = bodyRect(n.body);
    const picked = items.find(i => overlap(itemRect(i), r));
    if (!picked) return {};
    n.held = picked.kind;
    return { picked };
  }
  const kind = n.held;
  n.held = null;
  n.throwT = COMBAT.throwTime;
  const cfg = COMBAT.items[kind];
  const a = (COMBAT.throwAngle * Math.PI) / 180;
  const dy = it.up ? -Math.sin(a) : it.down ? Math.sin(a) : 0;
  const dx = dy === 0 ? 1 : Math.cos(a);
  const b = n.body;
  return {
    thrown: {
      kind, x: n.facing > 0 ? b.x + b.w : b.x, y: b.y + 0.3 * b.h,
      vx: dx * n.facing * cfg.speed, vy: dy * cfg.speed, from: 'nina', damage: cfg.damage, alive: true,
    },
  };
}

export function stepProjectiles(ps: Projectile[], room: Room, dt: number): void {
  for (const p of ps) {
    if (!p.alive) continue;
    p.vy += COMBAT.items[p.kind].gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const out = p.x < 0 || p.x >= ROOM_W || p.y < 0 || p.y >= ROOM_H;
    if (out || isSolid(tileAt(room, Math.floor(p.x), Math.floor(p.y)))) p.alive = false;
  }
}

export const projectileHit = (p: Projectile, r: Rect) => p.alive && contains(r, p.x, p.y);
