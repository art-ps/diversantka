import { FX } from '../config';

export type FloaterKind = 'damage' | 'enemy' | 'blocked';

export interface Floater { text: string; x: number; y: number; t: number; kind: FloaterKind }

// x, y — центр текста в момент появления. Соседние числа разводятся по горизонтали, чтобы не слипались.
export function spawnFloater(list: Floater[], text: string, x: number, y: number, kind: FloaterKind): void {
  const near = list.filter(f => Math.abs(f.x - x) < 1.5 && Math.abs(f.y - y) < 1.5 && f.t < FX.floatTime / 2).length;
  list.push({ text, x: x + (near % 2 ? 1 : -1) * Math.ceil(near / 2) * 0.8, y, t: 0, kind });
}

export function stepFloaters(list: Floater[], dt: number): Floater[] {
  for (const f of list) f.t += dt;
  return list.filter(f => f.t < FX.floatTime);
}

// Поднимается с замедлением, в конце гаснет.
export function floaterView(f: Floater): { x: number; y: number; alpha: number } {
  const p = Math.min(1, f.t / FX.floatTime);
  const rise = FX.floatRise * (1 - (1 - p) * (1 - p));
  const left = FX.floatTime - f.t;
  return { x: f.x, y: f.y - rise, alpha: left >= FX.floatFade ? 1 : Math.max(0, left / FX.floatFade) };
}
