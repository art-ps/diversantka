import type { Game } from './game';

declare global {
  interface Window { umami?: { track(name: string, data?: Record<string, unknown>): void } }
}

export type StatsEvent = { name: 'mission-start' | 'mission-win' | 'mission-death' | 'mission-fail'; data: { mission: number } };

// Что уже отправлено: ключи — объекты миссии и героини, рестарт подменяет их новыми и считается заново.
export type StatsSeen = { started: WeakSet<object>; ended: WeakSet<object>; dead: WeakSet<object>; diedIn: WeakSet<object> };

export const createStatsSeen = (): StatsSeen => ({ started: new WeakSet(), ended: new WeakSet(), dead: new WeakSet(), diedIn: new WeakSet() });

// События Umami за кадр; порядок: старт, гибель, затем победа/провал. Реплей по ссылке вызывающий не опрашивает.
export function statsEvents(g: Game, seen: StatsSeen): StatsEvent[] {
  const out: StatsEvent[] = [];
  const data = { mission: g.missionId };
  const m = g.mission;
  if (g.prologue === null && g.arrival === null && !seen.started.has(m)) {
    seen.started.add(m);
    out.push({ name: 'mission-start', data });
  }
  if (g.nina.dead && !seen.dead.has(g.nina)) {
    seen.dead.add(g.nina);
    seen.diedIn.add(m);
    out.push({ name: 'mission-death', data });
  }
  if (m.result !== null && !seen.ended.has(m)) {
    seen.ended.add(m);
    if (m.result === 'won') out.push({ name: 'mission-win', data });
    else if (!seen.diedIn.has(m)) out.push({ name: 'mission-fail', data });
  }
  return out;
}
