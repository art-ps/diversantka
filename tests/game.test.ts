import { expect, it } from 'vitest';
import { DT, NINA } from '../src/config';
import { createGame, enterRoom, stepGame } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { loadRoomsFs } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });

it('бег вправо из lab-1 приводит в lab-2', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 34, bottom: 22 });
  for (let i = 0; i < 120 && g.roomId === 'lab-1'; i++) stepGame(g, I({ moveX: 1 }), DT);
  expect(g.roomId).toBe('lab-2');
  expect(g.nina.body.x).toBeLessThan(2);
});

it('спуск по лестнице из lab-2 в cave-1 без урона', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-2', x: 18.7, bottom: 22 });
  for (let i = 0; i < 5; i++) stepGame(g, I(), DT);
  for (let i = 0; i < 600; i++) stepGame(g, I({ down: true }), DT);
  expect(g.roomId).toBe('cave-1');
  expect(g.nina.state).toBe('ground');
  expect(g.nina.body.y + g.nina.body.h).toBeCloseTo(23);
  expect(g.nina.energy).toBe(NINA.energyMax);
});

it('во время перехода симуляция стоит', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 34, bottom: 22 });
  while (!g.transition) stepGame(g, I({ moveX: 1 }), DT);
  const x = g.nina.body.x;
  stepGame(g, I({ moveX: 1 }), DT);
  expect(g.nina.body.x).toBe(x);
});

it('после гибели прыжок возвращает на старт', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  g.nina.dead = true;
  g.roomId = 'cave-1';
  stepGame(g, I({ jump: true, jumpPressed: true }), DT);
  expect(g.roomId).toBe('lab-1');
  expect(g.nina.dead).toBe(false);
});

it('аниматор: бег переключает клип на walk/run, на лестнице — climb', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  for (let i = 0; i < 40; i++) stepGame(g, I({ moveX: 1 }), DT);
  expect(['walk', 'run']).toContain(g.anim.clip);
  const l = createGame(loadRoomsFs(), { room: 'lab-1', x: 29.7, bottom: 22 });
  for (let i = 0; i < 10; i++) stepGame(l, I({ up: true }), DT);
  expect(l.anim.clip).toBe('climb');
});

it('подъём по лестнице из cave-1 в lab-2: аниматор сдвинут вместе с Ниной, приземления нет', () => {
  const g = createGame(loadRoomsFs(), { room: 'cave-1', x: 18.7, bottom: 23 });
  for (let i = 0; i < 5; i++) stepGame(g, I(), DT);
  for (let i = 0; i < 600 && g.roomId === 'cave-1'; i++) stepGame(g, I({ up: true }), DT);
  expect(g.roomId).toBe('lab-2');
  expect(g.anim.lastY).toBeCloseTo(g.nina.body.y, 0);
  const clips: string[] = [];
  for (let i = 0; i < 120; i++) { stepGame(g, I(), DT); clips.push(g.anim.clip); }
  expect(clips).not.toContain('land');
});

it('после гибели играет клип смерти', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  g.nina.dead = true;
  stepGame(g, I(), DT);
  expect(g.anim.clip).toBe('death');
});

it('предмет подбирается и после смены комнаты не появляется снова', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 5.4, bottom: 22 });
  for (let i = 0; i < 3; i++) stepGame(g, I(), DT);
  stepGame(g, I({ throwPressed: true }), DT);
  expect(g.nina.held).toBe('knife');
  enterRoom(g, 'lab-2');
  enterRoom(g, 'lab-1');
  expect(g.items).toHaveLength(0);
});

it('бросок создаёт снаряд, смена комнаты их убирает', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 10, bottom: 22 });
  g.nina.held = 'knife';
  for (let i = 0; i < 3; i++) stepGame(g, I(), DT);
  stepGame(g, I({ throwPressed: true }), DT);
  expect(g.projectiles).toHaveLength(1);
  enterRoom(g, 'lab-2');
  expect(g.projectiles).toHaveLength(0);
});

it('убитый андроид не возвращается после смены комнаты, живой — на месте', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  expect(g.androids).toHaveLength(1);
  g.androids[0].hp = 1;
  g.projectiles.push({ kind: 'stone', x: g.androids[0].body.x + 0.5, y: g.androids[0].body.y + 1, vx: 0.1, vy: 0, from: 'nina', damage: 1, alive: true });
  stepGame(g, I(), DT);
  expect(g.killed.has('lab-1#e0')).toBe(true);
  enterRoom(g, 'lab-2');
  enterRoom(g, 'lab-1');
  expect(g.androids).toHaveLength(0);
});
