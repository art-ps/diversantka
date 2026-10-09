import { expect, it } from 'vitest';
import { DT, NINA } from '../src/config';
import { createGame, createPrologue, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import type { Room } from '../src/world/room';
import { FLOOR, loadRoomsFs, roomOf } from './helpers';

const R = (id: string, meta: Record<string, string>, exits: Room['exits'] = {}): Room => ({ ...roomOf({ 22: FLOOR }, exits), id, meta });
const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const PAUSE = I({ pausePressed: true });
const run = (g: Game, it: Intent, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) stepGame(g, it, DT);
};
const world = () => new Map([
  ['a', R('a', { terminals: '20,22', enemies: 'android@30,22 patrol=24..36' }, { right: 'b' })],
  ['b', R('b', {}, { left: 'a' })],
]);
const ready = () => {
  const g = createGame(world(), { room: 'a', x: 4, bottom: 22 });
  run(g, IDLE, 10);
  return g;
};

it('Esc/Start: мир и таймер стоят, удержание и нажатия в паузе в мир не уходят; второе нажатие — дальше', () => {
  const g = ready();
  const t = g.mission.timeLeft, x = g.nina.body.x, ax = g.androids[0].body.x;
  stepGame(g, PAUSE, DT);
  expect(g.paused).toBe(true);
  run(g, I({ moveX: 1, jump: true }), 60);
  stepGame(g, I({ jump: true, jumpPressed: true, attackPressed: true }), DT);
  expect(g.mission.timeLeft).toBe(t);
  expect(g.nina.body.x).toBe(x);
  expect(g.nina.state).toBe('ground');
  expect(g.nina.attack).toBeNull();
  expect(g.androids[0].body.x).toBe(ax);
  stepGame(g, I({ pausePressed: true, jump: true, jumpPressed: true }), DT);
  expect(g.paused).toBe(false);
  expect(g.nina.state).toBe('ground'); // прыжок из кадра, снявшего паузу, не случился
  expect(g.mission.timeLeft).toBe(t);
  run(g, IDLE, 10);
  expect(g.mission.timeLeft).toBeLessThan(t);
});

it('пауза замораживает и смену экрана', () => {
  const g = ready();
  g.nina.body.x = 38.5;
  run(g, I({ moveX: 1 }), 60, () => g.transition !== null);
  expect(g.roomId).toBe('b');
  const tt = g.transition!.t;
  stepGame(g, PAUSE, DT);
  run(g, IDLE, 30);
  expect(g.transition!.t).toBe(tt);
});

it('на экране ЭВМ Esc паузу не ставит; на итоге и провале — тоже', () => {
  const g = ready();
  g.nina.body.x = 20 - NINA.w / 2;
  run(g, IDLE, 5);
  stepGame(g, I({ usePressed: true }), DT);
  expect(g.screen).not.toBeNull();
  stepGame(g, PAUSE, DT);
  expect(g.paused).toBe(false);
  expect(g.screen).not.toBeNull();
  const f = ready();
  f.mission.timeLeft = DT / 2;
  run(f, IDLE, 2);
  expect(f.mission.result).toBe('failed');
  stepGame(f, PAUSE, DT);
  expect(f.paused).toBe(false);
});

it('в прологе паузы нет: ни в полёте, ни в падении после отцепления', () => {
  const g = createPrologue(loadRoomsFs());
  run(g, IDLE, 60);
  const d = g.prologue!.d;
  stepGame(g, PAUSE, DT);
  expect(g.paused).toBe(false);
  expect(g.prologue!.d).toBeGreaterThan(d);
  g.prologue!.phase = 'fall';
  stepGame(g, PAUSE, DT);
  expect(g.paused).toBe(false);
});

it('открытые комнаты: копятся с посадки, пролог не в счёт, гибель не откатывает', () => {
  const p = createPrologue(loadRoomsFs());
  run(p, IDLE, 120);
  expect(p.seen.size).toBe(0);
  const g = ready();
  expect([...g.seen]).toEqual(['a']);
  g.nina.body.x = 38.5;
  run(g, I({ moveX: 1 }), 60, () => g.roomId === 'b');
  run(g, IDLE, 30);
  expect([...g.seen].sort()).toEqual(['a', 'b']);
  g.nina.dead = true;
  g.nina.deadT = NINA.respawnDelay;
  stepGame(g, I({ jump: true, jumpPressed: true }), DT);
  expect(g.roomId).toBe('a');
  expect([...g.seen].sort()).toEqual(['a', 'b']);
});
