import { expect, it } from 'vitest';
import { ANDROID, DT, FLAMER, NINA } from '../src/config';
import { createGame, enterRoom, stepGame } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { hurtNina } from '../src/sim/nina';
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
  g.nina.deadT = NINA.respawnDelay;
  g.roomId = 'cave-1';
  stepGame(g, I({ jump: true, jumpPressed: true }), DT);
  expect(g.roomId).toBe('lab-1');
  expect(g.nina.dead).toBe(false);
});

it('возрождение только после паузы respawnDelay', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  for (let i = 0; i < 5; i++) stepGame(g, I(), DT);
  hurtNina(g.nina, NINA.energyMax + 1, 1);
  stepGame(g, I({ jump: true, jumpPressed: true }), DT);
  expect(g.nina.dead).toBe(true);
  for (let i = 0; i < Math.ceil(NINA.respawnDelay / DT) + 2; i++) stepGame(g, I(), DT);
  stepGame(g, I({ jump: true, jumpPressed: true }), DT);
  expect(g.nina.dead).toBe(false);
});

it('мёртвое тело в воздухе падает на пол и остаётся в комнате', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  for (let i = 0; i < 5; i++) stepGame(g, I(), DT);
  for (let i = 0; i < 10; i++) stepGame(g, I({ jump: true, jumpPressed: i === 0 }), DT);
  expect(g.nina.body.onGround).toBe(false);
  hurtNina(g.nina, NINA.energyMax + 1, 1);
  for (let i = 0; i < 120; i++) stepGame(g, I(), DT);
  expect(g.nina.body.y + g.nina.body.h).toBeCloseTo(22);
  expect(g.roomId).toBe('lab-1');
});

it('живой андроид после выхода и входа снова на месте с полным hp', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  const a = g.androids[0];
  const x0 = a.body.x;
  a.hp = 1;
  a.body.x += 3;
  enterRoom(g, 'lab-2');
  enterRoom(g, 'lab-1');
  expect(g.androids).toHaveLength(1);
  expect(g.androids[0].hp).toBe(ANDROID.hp);
  expect(g.androids[0].body.x).toBe(x0);
});

it('аниматор: бег переключает клип на walk/run, на лестнице — climb', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  for (let i = 0; i < 20; i++) stepGame(g, I({ moveX: 1 }), DT);
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
  g.projectiles.push({ kind: 'stone', x: g.androids[0].body.x + 0.5, y: g.androids[0].body.y + 1, vx: 0.1, vy: 0, from: 'nina', damage: 1, alive: true, hitWall: false });
  stepGame(g, I(), DT);
  expect(g.killed.has('lab-1#e0')).toBe(true);
  enterRoom(g, 'lab-2');
  enterRoom(g, 'lab-1');
  expect(g.androids).toHaveLength(0);
});

it('потеря энергии от падения всплывает числом над героиней', () => {
  const g = createGame(loadRoomsFs(), { room: 'cave-1', x: 30, bottom: 2 }); // высоко над полом пещеры
  for (let i = 0; i < 120 && g.floaters.length === 0; i++) stepGame(g, I(), DT); // число живёт 0.8 с — смотрим сразу после приземления
  const dmg = g.floaters.filter(f => f.kind === 'damage');
  expect(dmg).toHaveLength(1);
  expect(dmg[0].text).toMatch(/^-\d+$/);
});

it('восстановление энергии не рождает чисел', () => {
  const g = createGame(loadRoomsFs(), { room: 'cave-1', x: 30, bottom: 23 });
  g.nina.energy = 50;
  for (let i = 0; i < 60; i++) stepGame(g, I(), DT);
  expect(g.floaters).toHaveLength(0);
});

it('попадание по андроиду — «-1» над ним, добивание — «ВЫВЕДЕН»', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  const a = g.androids[0];
  const stone = () => ({ kind: 'stone' as const, x: a.body.x + 0.5, y: a.body.y + 1, vx: 0.1, vy: 0, from: 'nina' as const, damage: 1, alive: true, hitWall: false });
  g.projectiles.push(stone());
  stepGame(g, I(), DT);
  expect(g.floaters.map(f => f.text)).toContain('-1');
  a.invulnT = 0;
  a.hp = 1;
  g.projectiles.push(stone());
  stepGame(g, I(), DT);
  expect(g.floaters.map(f => f.text)).toContain('ВЫВЕДЕН');
});

it('смена комнаты убирает числа', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  g.floaters.push({ text: '-5', x: 5, y: 18, t: 0, kind: 'damage' });
  enterRoom(g, 'lab-2');
  expect(g.floaters).toHaveLength(0);
});

it('добитый андроид рассыпается: частицы есть, сам он больше не рисуется', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  const a = g.androids[0];
  a.hp = 1;
  g.projectiles.push({ kind: 'stone', x: a.body.x + 0.5, y: a.body.y + 1, vx: 0.1, vy: 0, from: 'nina', damage: 1, alive: true, hitWall: false });
  stepGame(g, I(), DT);
  expect(a.gone).toBe(true);
  expect(g.particles.length).toBeGreaterThan(10);
  for (let i = 0; i < 120; i++) stepGame(g, I(), DT);
  expect(g.particles).toHaveLength(0);
});

it('попадание даёт искры; смена комнаты чистит частицы', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  const a = g.androids[0];
  g.projectiles.push({ kind: 'stone', x: a.body.x + 0.5, y: a.body.y + 1, vx: 0.1, vy: 0, from: 'nina', damage: 1, alive: true, hitWall: false });
  stepGame(g, I(), DT);
  expect(g.particles.length).toBeGreaterThan(0);
  enterRoom(g, 'lab-2');
  expect(g.particles).toHaveLength(0);
});

it('огонь: энергия убывает, число всплывает не каждый кадр', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-2', x: 34, bottom: 22 });
  const f = g.flamers[0];
  f.t = FLAMER.off + 0.01; // сразу огонь
  const e0 = g.nina.energy;
  for (let i = 0; i < 30; i++) stepGame(g, I(), DT); // 0.5 с в огне
  expect(g.nina.energy).toBeLessThan(e0 - FLAMER.dps * 0.4);
  expect(g.floaters.filter(x => x.kind === 'damage').length).toBeLessThanOrEqual(3);
  expect(g.floaters.length).toBeGreaterThan(0);
  expect(g.particles.length).toBeGreaterThan(0);
});

it('убитая собака рассыпается и не возвращается', () => {
  const g = createGame(loadRoomsFs(), { room: 'cave-1', x: 4, bottom: 23 });
  expect(g.dogs).toHaveLength(1);
  const d = g.dogs[0];
  g.projectiles.push({ kind: 'stone', x: d.body.x + 0.8, y: d.body.y + 0.7, vx: 0.1, vy: 0, from: 'nina', damage: 1, alive: true, hitWall: false });
  stepGame(g, I(), DT);
  expect(d.gone).toBe(true);
  expect(g.killed.has(d.id)).toBe(true);
  expect(g.floaters.map(f => f.text)).toContain('ВЫВЕДЕН');
  enterRoom(g, 'lab-2');
  enterRoom(g, 'cave-1');
  expect(g.dogs).toHaveLength(0);
});
