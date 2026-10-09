import { COMBAT } from '../config';
import type { Body } from './physics';
import type { Rect } from './rect';

export type AttackKind = 'punch' | 'kick' | 'flykick' | 'crouchkick';

export interface Attack {
  kind: AttackKind;
  t: number;
  hits: string[]; // кого этот удар уже задел — по одному разу за удар
}

export const attackTotal = (k: AttackKind) => COMBAT[k].windup + COMBAT[k].active + COMBAT[k].recover;

export function isActive(at: Attack): boolean {
  const a = COMBAT[at.kind];
  return at.t >= a.windup - 1e-9 && at.t < a.windup + a.active - 1e-9;
}

// Зона удара перед телом: по ширине — дальность, по высоте — полоса от макушки.
export function attackBox(b: Body, facing: 1 | -1, at: Attack | null): Rect | null {
  if (!at || !isActive(at)) return null;
  const a = COMBAT[at.kind];
  return { x: facing > 0 ? b.x + b.w : b.x - a.reach, y: b.y + a.top * b.h, w: a.reach, h: (a.bottom - a.top) * b.h };
}
