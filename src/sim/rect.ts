import type { Body } from './physics';

export interface Rect { x: number; y: number; w: number; h: number }

export const bodyRect = (b: Body): Rect => ({ x: b.x, y: b.y, w: b.w, h: b.h });
export const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const contains = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
