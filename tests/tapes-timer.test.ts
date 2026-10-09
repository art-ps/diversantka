import { expect, it } from 'vitest';
import { DT, MISSION, NINA } from '../src/config';
import { createGame, enterRoom, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { drawGame } from '../src/render/scene';
import { parsePoints } from '../src/world/spawns';
import type { Room } from '../src/world/room';
import { FLOOR, roomOf } from './helpers';

const R = (id: string, meta: Record<string, string>, exits: Room['exits'] = {}, rows: Record<number, string> = { 22: FLOOR }): Room =>
  ({ ...roomOf(rows, exits), id, meta });
const press = (g: Game, p: Partial<Intent>) => stepGame(g, { ...IDLE, ...p }, DT);
const wait = (g: Game, s: number) => { for (let i = 0; i < Math.round(s / DT); i++) stepGame(g, IDLE, DT); };

it('tapes: «x,низ ; x,низ», кривая запись — ошибка с файлом', () => {
  expect(parsePoints('8,22 ; 30.5,14', 'a', 'ленты')).toEqual([{ x: 8, bottom: 22 }, { x: 30.5, bottom: 14 }]);
  expect(parsePoints(undefined, 'a', 'ленты')).toEqual([]);
  expect(() => parsePoints('8', 'lab-1', 'ленты')).toThrow('lab-1: плохая запись ленты «8»');
  expect(() => parsePoints('tape@8,22', 'lab-1', 'ленты')).toThrow('lab-1: плохая запись ленты «tape@8,22»');
});

it('лента подбирается касанием в сумку, руки свободны, после смены комнаты не появляется', () => {
  const rooms = new Map([['a', R('a', { tapes: '8,22 ; 30,22' })], ['b', R('b', {})]]);
  const g = createGame(rooms, { room: 'a', x: 7.4, bottom: 22 });
  expect(g.tapes).toHaveLength(2);
  wait(g, 0.1);
  expect([...g.mission.tapes]).toEqual(['a#t0']);
  expect(g.nina.held).toBeNull();
  expect(g.tapes.map(t => t.id)).toEqual(['a#t1']);
  expect(g.floaters.map(f => f.text)).toContain('ЛЕНТА 1/6');
  enterRoom(g, 'b');
  enterRoom(g, 'a');
  expect(g.tapes.map(t => t.id)).toEqual(['a#t1']);
});

it('таймер идёт в переходе и после гибели', () => {
  const rooms = new Map([['a', R('a', {}, { right: 'b' })], ['b', R('b', {}, { left: 'a' })]]);
  const g = createGame(rooms, { room: 'a', x: 36, bottom: 22 });
  wait(g, 1);
  expect(g.mission.timeLeft).toBeCloseTo(MISSION.time - 1, 1);
  while (!g.transition) press(g, { moveX: 1 });
  const t0 = g.mission.timeLeft;
  press(g, { moveX: 1 });
  expect(g.mission.timeLeft).toBeCloseTo(t0 - DT);
  g.transition = null;
  g.nina.dead = true;
  const t1 = g.mission.timeLeft;
  wait(g, 1);
  expect(g.mission.timeLeft).toBeCloseTo(t1 - 1, 1);
});

it('таймер 0 — провал: мир стоит, после гибели прыжок не возрождает', () => {
  const g = createGame(new Map([['a', R('a', {})]]), { room: 'a', x: 4, bottom: 22 });
  wait(g, 0.1);
  g.mission.timeLeft = DT / 2;
  const x = g.nina.body.x;
  press(g, { moveX: 1 });
  expect(g.mission.result).toBe('failed');
  expect(g.mission.timeLeft).toBe(0);
  for (let i = 0; i < 30; i++) press(g, { moveX: 1 });
  expect(g.nina.body.x).toBe(x);
  const d = createGame(new Map([['a', R('a', {})]]), { room: 'a', x: 4, bottom: 22 });
  d.nina.dead = true;
  d.nina.deadT = NINA.respawnDelay;
  d.mission.timeLeft = DT / 2;
  press(d, { jump: true, jumpPressed: true });
  expect(d.mission.result).toBe('failed');
  expect(d.nina.dead).toBe(true);
});

it('удары считаются, огонь и вода — нет', () => {
  const g = createGame(new Map([['a', R('a', {})]]), { room: 'a', x: 10, bottom: 22 });
  wait(g, 0.1);
  const b = g.nina.body;
  g.projectiles.push({ kind: 'knife', x: b.x + 0.6, y: b.y + 1, vx: 0.1, vy: 0, from: 'enemy', damage: 5, alive: true, hitWall: false });
  press(g, {});
  expect(g.mission.hits).toBe(1);
  wait(g, 1); // неуязвимость прошла — новых ударов нет
  expect(g.mission.hits).toBe(1);
  const w = createGame(new Map([['w', R('w', {}, {}, { 21: '~'.repeat(20), 22: FLOOR })]]), { room: 'w', x: 4, bottom: 22 });
  wait(w, 1);
  expect(w.nina.energy).toBeLessThan(NINA.energyMax);
  expect(w.mission.hits).toBe(0);
});

it('HUD: ленты и таймер в строке 0', () => {
  const g = createGame(new Map([['a', R('a', { tapes: '8,22' })]]), { room: 'a', x: 30, bottom: 22 });
  const texts: string[] = [];
  const b = { push: () => {}, text: (_x: number, _y: number, s: string) => { texts.push(s); } };
  drawGame(b as never, g, 1);
  expect(texts).toContain('ЛЕНТЫ 0/6 · ');
  expect(texts).toContain('15:00');
});
