import { PROLOGUE, ROOM_W } from '../config';
import { tileAt, type Room } from '../world/room';
import { isSolid } from './physics';
import type { Rect } from './rect';

// Экраны пролога слева направо: море, море, склон перед НИИ, крыша (мачта — на её правом краю).
export const ROUTE = ['sea-1', 'sea-2', 'slope-1', 'roof-1'] as const;
export const ROUTE_LEN = ROUTE.length * ROOM_W;

// Где дельтаплан после пути d: экран, центр на экране, низ ног висящей Нины.
export interface GliderAt { screen: number; x: number; bottom: number }

export function gliderAt(d: number): GliderAt {
  const screen = Math.min(ROUTE.length - 1, Math.floor(d / ROOM_W));
  const k = Math.min(1, d / ROUTE_LEN);
  return { screen, x: d - screen * ROOM_W, bottom: PROLOGUE.bottomFrom + (PROLOGUE.bottomTo - PROLOGUE.bottomFrom) * k };
}

// Крыло, трапеция и висящая Нина — одним прямоугольником.
export const gliderRect = (a: GliderAt): Rect => ({ x: a.x - PROLOGUE.span / 2, y: a.bottom - PROLOGUE.height, w: PROLOGUE.span, h: PROLOGUE.height });

// Дельтаплан задел стену (мачту) — удар.
export function gliderHits(room: Room, a: GliderAt): boolean {
  const r = gliderRect(a);
  for (let row = Math.floor(r.y); row <= Math.floor(r.y + r.h - 1e-6); row++)
    for (let c = Math.floor(r.x); c <= Math.floor(r.x + r.w - 1e-6); c++) if (isSolid(tileAt(room, c, row))) return true;
  return false;
}
