import { expect, it } from 'vitest';
import { DT, MISSION, NINA } from '../src/config';
import { createGame, enterRoom, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { flamerPhase } from '../src/sim/flamer';
import { createNina } from '../src/sim/nina';
import type { Room } from '../src/world/room';
import { FLOOR, roomOf } from './helpers';

const R = (id: string, meta: Record<string, string>, exits: Room['exits'] = {}): Room => ({ ...roomOf({ 22: FLOOR }, exits), id, meta });
const press = (g: Game, p: Partial<Intent>) => stepGame(g, { ...IDLE, ...p }, DT);
const wait = (g: Game, s: number) => { for (let i = 0; i < Math.round(s / DT); i++) stepGame(g, IDLE, DT); };
const standAt = (g: Game, x: number) => { g.nina = createNina(x - NINA.w / 2, 22); wait(g, 0.1); };
const jump = (g: Game) => press(g, { jump: true, jumpPressed: true });
const die = (g: Game) => { g.nina.dead = true; g.nina.deadT = NINA.respawnDelay; jump(g); };
// Терминал: первый пункт — ОТКЛ. ОГНЕМЁТ, затем ВЫХОД.
const disableAndLeave = (g: Game) => {
  press(g, { usePressed: true });
  wait(g, MISSION.bootTime);
  jump(g);
  press(g, { down: true, downPressed: true });
  jump(g);
};

const world = () => new Map([
  ['a', R('a', { terminals: '20,22 controls=b', tapes: '30,22' }, { right: 'b' })],
  ['b', R('b', { tapes: '8,22', enemies: 'flamer@38,19 dir=left' }, { left: 'a' })],
]);

it('смерть после терминала: ленты, флаги и таймер из чекпоинта, энергия полная, место у терминала', () => {
  const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
  standAt(g, 30); // лента a#t0 — до чекпоинта
  standAt(g, 20);
  disableAndLeave(g);
  const saved = g.mission.checkpoint.timeLeft;
  enterRoom(g, 'b');
  standAt(g, 8); // лента b#t0 — после чекпоинта
  expect(g.mission.tapes.size).toBe(2);
  g.mission.fenceOff = true; // флаг после чекпоинта
  g.mission.hits = 3;
  wait(g, 2);
  die(g);
  expect(g.nina.dead).toBe(false);
  expect(g.roomId).toBe('a');
  expect(g.nina.energy).toBe(NINA.energyMax);
  expect(g.nina.body.x + NINA.w / 2).toBeCloseTo(20);
  expect([...g.mission.tapes]).toEqual(['a#t0']);
  expect(g.mission.fenceOff).toBe(false);
  expect(g.mission.flamersOff.has('b')).toBe(true);
  expect(g.mission.timeLeft).toBeCloseTo(saved);
  expect(g.mission.hits).toBe(3); // удары за миссию не откатываются
  expect(g.tapes).toHaveLength(0); // лента до чекпоинта не вернулась
  enterRoom(g, 'b');
  expect(g.tapes.map(t => t.id)).toEqual(['b#t0']); // после чекпоинта — снова на месте
  expect(g.flamers[0].off).toBe(true);
});

it('возрождение в комнате с выключенным огнемётом: он молчит', () => {
  const rooms = new Map([['c', R('c', { terminals: '10,22 controls=c', enemies: 'flamer@38,19 dir=left' })]]);
  const g = createGame(rooms, { room: 'c', x: 2, bottom: 22 });
  standAt(g, 10);
  disableAndLeave(g);
  die(g);
  expect(g.flamers[0].off).toBe(true);
  for (let i = 0; i < Math.round(4 / DT); i++) {
    stepGame(g, IDLE, DT);
    expect(flamerPhase(g.flamers[0])).toBe('off');
  }
});

it('смерть до первого терминала — старт миссии', () => {
  const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
  standAt(g, 30);
  expect(g.mission.tapes.size).toBe(1);
  wait(g, 1);
  die(g);
  expect(g.roomId).toBe('a');
  expect(g.nina.body.x).toBe(2);
  expect(g.mission.tapes.size).toBe(0);
  expect(g.mission.timeLeft).toBe(MISSION.time);
  expect(g.tapes).toHaveLength(1);
});

it('убитые враги после смерти остаются мёртвыми', () => {
  const rooms = new Map([['k', R('k', { enemies: 'android@30,22 patrol=28..32' })]]);
  const g = createGame(rooms, { room: 'k', x: 2, bottom: 22 });
  const a = g.androids[0];
  a.hp = 1;
  g.projectiles.push({ kind: 'stone', x: a.body.x + 0.5, y: a.body.y + 1, vx: 0.1, vy: 0, from: 'nina', damage: 1, alive: true, hitWall: false });
  stepGame(g, IDLE, DT);
  expect(g.killed.has('k#e0')).toBe(true);
  die(g);
  expect(g.nina.dead).toBe(false);
  expect(g.androids).toHaveLength(0);
});

it('огнемёт молчит после смерти: флаги берутся из чекпоинта, а не из живого состояния', () => {
  const rooms = new Map([['c', R('c', { terminals: '10,22 controls=c', enemies: 'flamer@38,19 dir=left' })]]);
  const g = createGame(rooms, { room: 'c', x: 2, bottom: 22 });
  standAt(g, 10);
  disableAndLeave(g);
  g.mission.flamersOff.clear(); // живое состояние потеряло флаг, чекпоинт его помнит
  die(g);
  expect(g.flamers[0].off).toBe(true);
});

it('флаг огнемёта, выставленный после чекпоинта, откатывается', () => {
  const rooms = new Map([['c', R('c', { terminals: '10,22 controls=c', enemies: 'flamer@38,19 dir=left' })]]);
  const g = createGame(rooms, { room: 'c', x: 2, bottom: 22 });
  standAt(g, 10);
  press(g, { usePressed: true }); // чекпоинт без отключения
  g.mission.flamersOff.add('c');
  g.screen = null;
  die(g);
  expect(g.flamers[0].off).toBe(false);
});
