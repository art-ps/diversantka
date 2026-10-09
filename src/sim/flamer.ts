import { FLAMER } from '../config';
import type { FlamerSpawn } from '../world/spawns';
import type { Rect } from './rect';

export interface Flamer { id: string; x: number; y: number; dir: 1 | -1; t: number }

export const createFlamer = (id: string, s: FlamerSpawn): Flamer => ({ id, x: s.x, y: s.y, dir: s.dir, t: 0 });

export function stepFlamer(f: Flamer, dt: number): void {
  f.t = (f.t + dt) % (FLAMER.off + FLAMER.on);
}

export function flamerPhase(f: Flamer): 'off' | 'warn' | 'on' {
  if (f.t >= FLAMER.off) return 'on';
  return f.t >= FLAMER.off - FLAMER.warn ? 'warn' : 'off';
}

export function flameRect(f: Flamer): Rect | null {
  if (flamerPhase(f) !== 'on') return null;
  return { x: f.dir > 0 ? f.x : f.x - FLAMER.length, y: f.y - FLAMER.halfH, w: FLAMER.length, h: 2 * FLAMER.halfH };
}
