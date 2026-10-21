import { describe, expect, it } from 'vitest';
import { DT, MISSION } from '../src/config';
import { createArrival, stepGame, type Game } from '../src/game';
import { STR } from '../src/i18n';
import { IDLE, type Intent } from '../src/input/intent';
import { MISSIONS } from '../src/missions';
import { CHARSET } from '../src/render/atlas';
import { arriveBikeX, BIKE_W } from '../src/render/bike';
import { drawGame } from '../src/render/scene';
import { createAndroid } from '../src/sim/android';
import { createGuard } from '../src/sim/guard';
import { elapsed } from '../src/sim/mission';
import { decodeIntent } from '../src/sim/record';
import { loadRoomsFs } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const ARRIVE_STEPS = Math.round(MISSION.arriveTime / DT);
const arrival = () => createArrival(loadRoomsFs('rooms2'));
const shot = (g: Game) => {
  const pushes: { x: number; ch: string }[] = [], texts: string[] = [];
  drawGame({ push: (x: number, _y: number, ch: string) => { pushes.push({ x, ch }); }, text: (_x: number, _y: number, s: string) => { texts.push(s); } } as never, g, 1);
  return { pushes, texts };
};
const until = (g: Game, t: number) => { while (g.arrival !== null && g.arrival < t) stepGame(g, IDLE, DT); };

describe('сцена приезда', () => {
  it('createArrival: миссия 2 на въезде, сцена с нуля, таймер 12:00', () => {
    const g = arrival();
    expect(g.missionId).toBe(2);
    expect(g.arrival).toBe(0);
    expect(g.roomId).toBe('gate');
    expect(g.mission.goal).toBe('bomb');
    expect(g.mission.timeLeft).toBe(MISSIONS[2].time);
    expect(g.start).toEqual(MISSIONS[2].start);
  });

  it('3 с: мир и таймер стоят, нажатия ничего не делают, шаги пишутся; звук bike — один раз в начале', () => {
    const g = arrival();
    const x = g.nina.body.x, body0 = { ...g.nina.body };
    const sfx: string[] = [];
    const presses = [I({ jump: true, jumpPressed: true }), I({ usePressed: true }), I({ moveX: 1 }), I({ pausePressed: true }), I({ attackPressed: true, throwPressed: true })];
    for (let i = 0; i < ARRIVE_STEPS; i++) {
      stepGame(g, presses[i % presses.length], DT);
      sfx.push(...g.sfx);
      g.sfx.length = 0;
      if (i < ARRIVE_STEPS - 1) expect(g.arrival, `шаг ${i}`).not.toBeNull();
    }
    expect(g.arrival).toBeNull();
    expect(sfx).toEqual(['bike']);
    expect(g.nina.body).toEqual(body0); // героиня стоит, где слезла: физика сцену не видит
    expect(g.anim.clip).toBe('idle');
    expect(g.anim.t).toBe(0); // одна поза из idle
    expect(g.paused).toBe(false);
    expect(g.screen).toBeNull();
    expect(g.mission.result).toBeNull();
    expect(g.mission.timeLeft).toBe(MISSIONS[2].time);
    expect(elapsed(g.mission)).toBe(0);
    expect(g.rec).toHaveLength(ARRIVE_STEPS);
    stepGame(g, I({ moveX: 1 }), DT);
    expect(g.mission.timeLeft).toBeCloseTo(MISSIONS[2].time - DT, 9);
    expect(g.nina.body.x).toBeGreaterThan(x);
  });

  it('мир стоит: андроид и охранник в комнате не двигаются и не меняют состояние за сцену', () => {
    const g = arrival();
    const b = g.nina.body, spot = { x: b.x + 2, bottom: b.y + b.h, patrol: [b.x - 4, b.x + 8] as [number, number] };
    g.androids.push(createAndroid('t#a', { kind: 'android', ...spot }));
    g.guards.push(createGuard('t#g', { kind: 'guard', ...spot }));
    const snap = () => JSON.stringify([g.androids, g.guards]);
    const before = snap();
    for (let i = 0; i < ARRIVE_STEPS; i++) stepGame(g, IDLE, DT);
    expect(g.arrival).toBeNull();
    expect(snap()).toBe(before);
  });

  it('названия миссий: ru и en', () => {
    expect(STR.en.missionName(2, 'bomb')).toBe('MISSION 2 · BUNKER');
    expect(STR.ru.missionName(2, 'bomb')).toBe('МИССИЯ 2 · БУНКЕР');
  });

  it('запись сцены воспроизводится: та же запись — то же состояние после сцены', () => {
    const a = arrival();
    for (let i = 0; i < ARRIVE_STEPS + 30; i++) stepGame(a, I({ moveX: i % 3 - 1, jumpPressed: i % 7 === 0, jump: i % 7 === 0 }), DT);
    const b = arrival();
    for (const c of a.rec) stepGame(b, decodeIntent(c), DT);
    expect(b.rec).toEqual(a.rec);
    expect(b.nina.body).toEqual(a.nina.body);
    expect(elapsed(b.mission)).toBe(elapsed(a.mission));
  });

  it('мотоцикл въезжает слева и встаёт на стоянку; героиня в седле, после езды — рядом, мотоцикл фарой вправо', () => {
    const stop = arrival().bike!.x;
    expect(arriveBikeX(0, stop) + BIKE_W / 2).toBeLessThanOrEqual(0);
    expect(arriveBikeX(MISSION.arriveRide, stop)).toBe(stop);
    expect(arriveBikeX(MISSION.arriveRide * 0.5, stop)).toBeLessThan(stop);
    const g = arrival();
    const wheels = () => shot(g).pushes.filter(p => '-\\|/'.includes(p.ch) && p.x < 12).map(p => p.x);
    until(g, 0.6);
    const x1 = Math.max(...wheels());
    until(g, 1.8);
    const x2 = Math.max(...wheels());
    expect(x2).toBeGreaterThan(x1);
    expect(shot(g).texts).toContain(STR.ru.missionName(2, 'bomb'));
    until(g, MISSION.arriveRide + 0.1);
    const parked = shot(g);
    expect(parked.pushes.some(p => p.ch === '<')).toBe(true); // фара вправо — рисунок не отражён: «o<», как в BIKE_ART
    expect(parked.pushes.some(p => p.ch === '>')).toBe(false);
    for (const p of parked.pushes) expect(CHARSET).toContain(p.ch);
    for (const t of parked.texts) for (const ch of t) expect(CHARSET).toContain(ch);
    until(g, MISSION.arriveTime + 1);
    expect(shot(g).texts).not.toContain(STR.ru.missionName(2, 'bomb'));
  });

  it('«заново» после провала в миссии 2 — снова сцена приезда', () => {
    const g = arrival();
    until(g, MISSION.arriveTime + 1);
    g.mission.timeLeft = DT / 2;
    stepGame(g, IDLE, DT);
    expect(g.mission.result).toBe('failed');
    for (let i = 0; i < Math.ceil(MISSION.restartDelay / DT) + 1; i++) stepGame(g, IDLE, DT);
    stepGame(g, I({ jump: true, jumpPressed: true }), DT);
    expect(g.mission.result).toBeNull();
    expect(g.missionId).toBe(2);
    expect(g.arrival).toBe(0);
    expect(g.rec).toEqual([]);
  });
});
