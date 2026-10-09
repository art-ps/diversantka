import { expect, it } from 'vitest';
import { DT, MISSION, NINA } from '../src/config';
import { createGame, enterRoom, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { drawGame } from '../src/render/scene';
import { flameRect, flamerPhase } from '../src/sim/flamer';
import { createNina } from '../src/sim/nina';
import type { Room } from '../src/world/room';
import { FLOOR, roomOf } from './helpers';

const R = (id: string, meta: Record<string, string>, exits: Room['exits'] = {}): Room => ({ ...roomOf({ 22: FLOOR }, exits), id, meta });
const press = (g: Game, p: Partial<Intent>) => stepGame(g, { ...IDLE, ...p }, DT);
const wait = (g: Game, s: number) => { for (let i = 0; i < Math.round(s / DT); i++) stepGame(g, IDLE, DT); };
const standAt = (g: Game, x: number) => { g.nina = createNina(x - NINA.w / 2, 22); wait(g, 0.1); };
const use = (g: Game) => press(g, { usePressed: true });
const jump = (g: Game) => press(g, { jump: true, jumpPressed: true });
const down = (g: Game) => press(g, { down: true, downPressed: true });

// a: терминал гасит огнемёты b; b: огнемёт; c: терминал и огнемёт в одной комнате
const world = () => new Map([
  ['a', R('a', { terminals: '20,22 controls=b' }, { right: 'b' })],
  ['b', R('b', { enemies: 'flamer@38,19 dir=left' }, { left: 'a' })],
  ['c', R('c', { terminals: '10,22 controls=c', enemies: 'flamer@38,19 dir=left' })],
]);
const collect = (g: Game) => {
  const texts: string[] = [], chars: string[] = [];
  const b = { push: (_x: number, _y: number, ch: string) => { chars.push(ch); }, text: (_x: number, _y: number, s: string) => { texts.push(s); chars.push(...s); } };
  drawGame(b as never, g, 1);
  return { texts, chars };
};

it('E у терминала открывает экран и пишет чекпоинт; мир стоит, таймер идёт', () => {
  const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
  standAt(g, 20.8);
  use(g);
  expect(g.screen).not.toBeNull();
  expect(g.mission.checkpoint).toMatchObject({ room: 'a', x: 20 - NINA.w / 2, bottom: 22 });
  const x = g.nina.body.x, t = g.mission.timeLeft;
  for (let i = 0; i < 60; i++) press(g, { moveX: 1 });
  expect(g.nina.body.x).toBe(x);
  expect(g.mission.timeLeft).toBeCloseTo(t - 1, 1);
});

it('далеко от терминала, в прыжке или после гибели E ничего не открывает', () => {
  const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
  standAt(g, 20 + MISSION.useRange + 0.2);
  use(g);
  expect(g.screen).toBeNull();
  standAt(g, 20);
  jump(g);
  use(g);
  expect(g.screen).toBeNull();
  standAt(g, 20);
  g.nina.dead = true;
  use(g);
  expect(g.screen).toBeNull();
});

it('ОТКЛ. ОГНЕМЁТ другой комнаты: там огнемёт молчит и после повторного входа', () => {
  const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
  standAt(g, 20);
  use(g);
  wait(g, MISSION.bootTime);
  jump(g);
  expect(g.mission.flamersOff.has('b')).toBe(true);
  expect(g.mission.checkpoint.flamersOff).toEqual(['b']);
  down(g);
  jump(g);
  expect(g.screen).toBeNull();
  enterRoom(g, 'b');
  for (let i = 0; i < Math.round(4 / DT); i++) {
    stepGame(g, IDLE, DT);
    expect(flamerPhase(g.flamers[0])).toBe('off');
  }
  enterRoom(g, 'a');
  enterRoom(g, 'b');
  expect(g.flamers[0].off).toBe(true);
});

it('огнемёт своей комнаты гаснет сразу, даже посреди залпа; струя догорает', () => {
  const g = createGame(world(), { room: 'c', x: 2, bottom: 22 });
  standAt(g, 10);
  g.flamers[0].t = 2.5; // идёт залп
  expect(flameRect(g.flamers[0])).not.toBeNull();
  use(g);
  wait(g, MISSION.bootTime);
  jump(g);
  expect(g.flamers[0].off).toBe(true);
  expect(flameRect(g.flamers[0])).toBeNull();
  down(g);
  jump(g);
  wait(g, 1);
  const jet = g.fires.find(f => f.kind === 'jet')!;
  expect(jet.field.on).toBe(false);
  expect(jet.field.heat.every(v => v === 0)).toBe(true);
});

it('нажатия не протекают: E, открывший экран, не выбирает; прыжок, закрывший экран, не прыгает', () => {
  const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
  standAt(g, 20);
  use(g);
  expect(g.screen!.t).toBe(0);
  wait(g, MISSION.bootTime);
  down(g);
  jump(g); // ВЫХОД
  expect(g.screen).toBeNull();
  expect(g.mission.flamersOff.size).toBe(0);
  for (let i = 0; i < 10; i++) press(g, { jump: true }); // кнопку ещё держат
  expect(g.nina.body.onGround).toBe(true);
  expect(g.nina.body.vy).toBe(0);
});

it('таймер истёк при открытом экране — провал, экран закрыт', () => {
  const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
  standAt(g, 20);
  use(g);
  g.mission.timeLeft = DT / 2;
  press(g, {});
  expect(g.mission.result).toBe('failed');
  expect(g.screen).toBeNull();
});

it('отрисовка: лог, затем меню с курсором; символы — из атласа', () => {
  const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
  standAt(g, 20);
  use(g);
  wait(g, MISSION.bootTime / 3);
  expect(collect(g).texts).not.toContain('ЧЕКПОИНТ ЗАПИСАН');
  wait(g, MISSION.bootTime);
  const { texts, chars } = collect(g);
  expect(texts).toContain('ЧЕКПОИНТ ЗАПИСАН');
  expect(texts).toContain('> ОТКЛ. ОГНЕМЁТ b');
  expect(texts).toContain('  ВЫХОД');
  for (const ch of chars) expect(CHARSET).toContain(ch);
});

it('терминал рисуется в комнате', () => {
  const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
  expect(collect(g).chars).toContain('▒');
});
