import { BOMB, GEN } from '../config';

// Сложность сгенерированного уровня n (с GEN.first): таблица спеки, раздел «6 — сложность и таймер».
export type Goal = 'tapes' | 'bomb';

export const goalOf = (n: number): Goal => (n % 2 ? 'bomb' : 'tapes');
export const roomsOf = (n: number): number => Math.min(GEN.roomsMax, 7 + n);
export const doorCount = (n: number): number => (n >= 8 ? 3 : n >= 5 ? 2 : 1);
export const loopsOf = (n: number): number => (n > 5 ? Math.min(4, 1 + Math.floor(n / 5)) : 1);
export const densityOf = (n: number): number => Math.min(GEN.densityMax, GEN.densityFrom + GEN.densityStep * (n - GEN.first));
export const tapesOf = (n: number): number => Math.min(6, 2 + Math.floor(n / 2));
export const kOf = (n: number): number => GEN.kFrom - (GEN.kFrom - GEN.kTo) * Math.min(1, (n - GEN.first) / GEN.kSpan);

// Слот огнемёта и камеры заполняется с такой вероятностью; вес охраны среди врагов (андроид 3, собака 2).
export const flamerChance = (n: number): number => (n < 4 ? 0 : Math.min(1, 0.4 + 0.05 * (n - 4)));
export const cameraChance = (n: number): number => (n < 6 ? 0 : Math.min(1, 0.3 + 0.05 * (n - 6)));
export const guardWeight = (n: number): number => (n < 5 ? 0 : Math.min(6, n - 3));

// Цель bomb-уровня — не дальше стольких переходов от старта: отход укладывается в долю отсчёта.
export const maxGoalHops = Math.floor((GEN.returnShare * BOMB.fuse) / GEN.roomSec);

// Таймер: оценка маршрута (переходы и враги) × k, вверх до 30 с, не короче GEN.minTime.
export const timerOf = (n: number, hops: number, enemies: number): number =>
  Math.max(GEN.minTime, Math.ceil(((hops * GEN.roomSec + enemies * GEN.fightSec) * kOf(n)) / 30) * 30);
