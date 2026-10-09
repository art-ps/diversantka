import { expect, it } from 'vitest';
import { DT, MISSION, NINA, PROLOGUE } from '../src/config';
import { createPrologue, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { gliderAt, ROUTE } from '../src/sim/glider';
import { isSolid } from '../src/sim/physics';
import { tileAt } from '../src/world/room';
import { loadRoomsFs } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const JUMP = I({ jump: true, jumpPressed: true });
const run = (g: Game, it: Intent, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) stepGame(g, it, DT);
};
const fresh = () => createPrologue(loadRoomsFs());
const bottomOf = (g: Game) => g.nina.body.y + g.nina.body.h;
const glider = (g: Game) => gliderAt(g.prologue!.d);
// Лететь, пока дельтаплан не окажется над экраном room не левее x (переход закончен).
const flyTo = (g: Game, room: string, x: number) =>
  run(g, IDLE, 3000, () => g.roomId === room && !g.transition && glider(g).x >= x);
// Отцепиться и ждать исхода: посадки (пролог кончился) или всплеска/удара.
const release = (g: Game) => {
  stepGame(g, JUMP, DT);
  run(g, IDLE, 600, () => !g.prologue || g.prologue.phase === 'splash' || g.prologue.phase === 'crash');
};
const inWall = (g: Game) => {
  const b = g.nina.body, room = g.rooms.get(g.roomId)!;
  for (let r = Math.floor(b.y + 1e-6); r <= Math.floor(b.y + b.h - 1e-6); r++)
    for (let c = Math.floor(b.x + 1e-6); c <= Math.floor(b.x + b.w - 1e-6); c++) if (isSolid(tileAt(room, c, r))) return true;
  return false;
};

it('пролог начинается над морем: дельтаплан летит вправо сам, Нина висит под ним', () => {
  const g = fresh();
  expect(g.roomId).toBe('sea-1');
  expect(g.prologue).toEqual({ d: PROLOGUE.startD, phase: 'fly', t: 0 });
  run(g, IDLE, 60);
  expect(g.prologue!.d).toBeCloseTo(PROLOGUE.startD + PROLOGUE.speed, 5);
  expect(g.nina.body.x + NINA.w / 2).toBeCloseTo(glider(g).x, 5);
  expect(bottomOf(g)).toBeCloseTo(glider(g).bottom, 5);
});

it('отцепление над крышей — посадка на крышу, отсюда стартует миссия', () => {
  const g = fresh();
  flyTo(g, 'roof-1', 15);
  release(g);
  expect(g.prologue).toBeNull();
  expect(g.roomId).toBe('roof-1');
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.dead).toBe(false);
  expect(g.mission.checkpoint).toMatchObject({ room: 'roof-1', bottom: 22, timeLeft: MISSION.time });
  expect(g.mission.checkpoint.x).toBeCloseTo(g.nina.body.x);
});

it('без отцепления — удар о мачту, через паузу пролог заново', () => {
  const g = fresh();
  run(g, IDLE, 3000, () => g.prologue!.phase === 'crash');
  expect(g.prologue!.phase).toBe('crash');
  expect(g.roomId).toBe('roof-1');
  expect(g.particles.length).toBeGreaterThan(0);
  run(g, IDLE, Math.round(PROLOGUE.retryDelay / DT) - 2);
  expect(g.prologue!.phase).toBe('crash');
  run(g, IDLE, 3);
  expect(g.prologue).toEqual({ d: PROLOGUE.startD, phase: 'fly', t: 0 });
  expect(g.roomId).toBe('sea-1');
});

it('отцепление над морем — всплеск, через паузу пролог заново (оба морских экрана)', () => {
  for (const [room, x] of [['sea-1', 10], ['sea-2', 20]] as const) {
    const g = fresh();
    flyTo(g, room, x);
    release(g);
    expect(g.prologue!.phase, room).toBe('splash');
    expect(g.roomId).toBe(room);
    expect(g.particles.length).toBeGreaterThan(0);
    run(g, IDLE, Math.round(PROLOGUE.retryDelay / DT) + 2, () => g.prologue!.phase === 'fly');
    expect(g.prologue).toEqual({ d: PROLOGUE.startD, phase: 'fly', t: 0 });
    expect(g.roomId).toBe('sea-1');
  }
});

it('отцепление над склоном — посадка на склон; урон от падения по высоте', () => {
  const g = fresh();
  flyTo(g, 'slope-1', 34);
  const from = glider(g).bottom;
  release(g);
  expect(g.prologue).toBeNull();
  expect(g.roomId).toBe('slope-1');
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.mission.checkpoint.room).toBe('slope-1');
  expect(g.nina.energy).toBeCloseTo(NINA.energyMax - (22 - from - NINA.safeFall) * NINA.fallDamagePerCell, 0);
});

it('до приземления таймер не идёт; после — идёт', () => {
  const g = fresh();
  flyTo(g, 'roof-1', 10);
  expect(g.mission.timeLeft).toBe(MISSION.time);
  stepGame(g, JUMP, DT);
  run(g, IDLE, 10);
  expect(g.prologue!.phase).toBe('fall');
  expect(g.mission.timeLeft).toBe(MISSION.time);
  run(g, IDLE, 600, () => !g.prologue);
  expect(MISSION.time - g.mission.timeLeft).toBeLessThanOrEqual(DT + 1e-9); // идёт с кадра посадки
  run(g, IDLE, 59);
  expect(g.mission.timeLeft).toBeCloseTo(MISSION.time - 1, 5);
});

it('в начале полёта прыжок ещё не отцепляет; во время смены экрана — тоже', () => {
  const g = fresh();
  stepGame(g, JUMP, DT);
  expect(g.prologue!.phase).toBe('fly');
  run(g, IDLE, 3000, () => !!g.transition);
  stepGame(g, JUMP, DT);
  expect(g.prologue!.phase).toBe('fly');
});

it('отцепление в последний кадр перед сменой экрана склон → крыша — посадка на склоне, не в стене', () => {
  const g = fresh();
  run(g, IDLE, 3000, () => g.roomId === 'slope-1' && !g.transition && gliderAt(g.prologue!.d + PROLOGUE.speed * DT).screen === 3);
  expect(glider(g).x).toBeGreaterThan(39.8);
  stepGame(g, JUMP, DT);
  const seen = new Set<string>();
  run(g, IDLE, 600, () => (seen.add(g.roomId), !g.prologue));
  expect([...seen]).toEqual(['slope-1']); // в стену lab-1 над дверью не заносит
  expect(g.prologue).toBeNull();
  expect(inWall(g)).toBe(false);
  expect(g.nina.state).toBe('ground');
});

it('отцепление в последний кадр перед мачтой — посадка на крышу рядом с мачтой, не в ней', () => {
  const g = fresh();
  const probe = fresh();
  run(probe, IDLE, 3000, () => probe.prologue!.phase === 'crash');
  const crashD = probe.prologue!.d;
  run(g, IDLE, 3000, () => g.prologue!.d + PROLOGUE.speed * DT >= crashD - 1e-9);
  release(g);
  expect(g.prologue).toBeNull();
  expect(g.roomId).toBe('roof-1');
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(inWall(g)).toBe(false);
  expect(g.nina.body.x + g.nina.body.w).toBeLessThanOrEqual(36);
});

it('после итога или провала «заново» — с пролога; прыжок, начавший заново, и удержание не отцепляют', () => {
  for (const result of ['won', 'failed'] as const) {
    const g = fresh();
    flyTo(g, 'roof-1', 15);
    release(g);
    g.mission.result = result;
    run(g, IDLE, Math.round((MISSION.outroTime + MISSION.restartDelay) / DT) + 2);
    stepGame(g, JUMP, DT);
    expect(g.prologue, result).toEqual({ d: PROLOGUE.startD, phase: 'fly', t: 0 });
    expect(g.roomId).toBe(ROUTE[0]);
    expect(g.mission.result).toBeNull();
    run(g, I({ jump: true }), 120);
    expect(g.prologue!.phase).toBe('fly');
    expect(g.mission.timeLeft).toBe(MISSION.time);
  }
});
