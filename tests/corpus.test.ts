import { expect, it } from 'vitest';
import { DT, FLAMER, NINA } from '../src/config';
import { createGame, enterRoom, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import type { Room } from '../src/world/room';
import { loadRoomsFs } from './helpers';
import { unreachable } from './reach';

// Корпус НИИ по этажам — настоящей физикой. Враги убраны, огнемёты выключены, если тест не про них.
const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const run = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) stepGame(g, I(p), DT);
};
const cx = (g: Game) => g.nina.body.x + g.nina.body.w / 2;
const bottomOf = (g: Game) => g.nina.body.y + g.nina.body.h;
const at = (room: string, x: number, bottom: number, flamers = false) => {
  const g = createGame(loadRoomsFs(), { room, x: x - NINA.w / 2, bottom });
  if (!flamers) g.mission.flamersOff = new Set(['lab-2', 'hall-1']);
  enterRoom(g, room);
  g.androids = [];
  g.dogs = [];
  run(g, {}, 5);
  return g;
};
// Дойти до центра x (у цели — медленно) и встать.
const walkTo = (g: Game, x: number) => {
  for (let i = 0; i < 900; i++) {
    const d = x - cx(g);
    if (Math.abs(d) < 0.25 && g.nina.state === 'ground' && Math.abs(g.nina.body.vx) < 0.5) break;
    stepGame(g, I({ moveX: Math.abs(d) < 1 ? Math.sign(d) * 0.3 : Math.sign(d) }), DT);
  }
  run(g, {}, 20);
};
// Прыжок с разгоном в сторону dir: держать прыжок и направление n кадров, потом встать.
const jump = (g: Game, dir: -1 | 0 | 1, n = 40) => {
  stepGame(g, I({ moveX: dir, jump: true, jumpPressed: true }), DT);
  run(g, { moveX: dir, jump: true }, n);
  run(g, {}, 20);
};
const climbUntil = (g: Game, dir: 'up' | 'down', until: () => boolean) => {
  run(g, { [dir]: true }, 1500, until);
  run(g, {}, 20);
};
const patch = (room: Room, cells: [number, number, string][], meta: Record<string, string> = room.meta): Room => {
  const tiles = room.tiles.map(row => [...row]);
  for (const [c, r, ch] of cells) tiles[r][c] = ch;
  return { ...room, meta, tiles: tiles.map(row => row.join('')) };
};
const LANDINGS = [{ room: 'roof-1', x: 8, bottom: 22 }, { room: 'slope-1', x: 2, bottom: 14 }];

// ---- крыша и этаж 3 ----

it('roof-2: короб и будку шагом не пройти — прыжками до roof-3 без урона', () => {
  const g = at('roof-2', 2, 22);
  run(g, { moveX: 1 }, 120);
  expect(cx(g)).toBeLessThan(8);
  walkTo(g, 5);
  jump(g, 1);
  walkTo(g, 26);
  jump(g, 1, 30);
  expect(bottomOf(g)).toBeCloseTo(19); // на будке
  run(g, { moveX: 1 }, 300, () => g.roomId === 'roof-3');
  run(g, {}, 30);
  expect(g.roomId).toBe('roof-3');
  expect(g.nina.energy).toBe(NINA.energyMax);
});

it('roof-3: горящий кабель бьёт, перепрыгивается; лента на баке — по лестнице x30', () => {
  const burn = at('roof-3', 10, 22);
  run(burn, { moveX: 1 }, 40);
  expect(burn.nina.energy).toBeLessThan(NINA.energyMax);
  const g = at('roof-3', 12.5, 22);
  jump(g, 1);
  expect(cx(g)).toBeGreaterThan(17);
  expect(g.nina.energy).toBe(NINA.energyMax);
  walkTo(g, 30.5);
  climbUntil(g, 'up', () => g.nina.state === 'ground' && bottomOf(g) < 13);
  expect(bottomOf(g)).toBeCloseTo(12);
  walkTo(g, 33);
  expect(g.mission.tapes.has('roof-3#t0')).toBe(true);
});

it('lab-3: с уступа вниз без урона, лента на полке — по лестнице x34, назад на уступ — по x10', () => {
  const g = at('lab-3', 2, 14);
  run(g, { moveX: 1 }, 120, () => g.nina.state === 'ground' && bottomOf(g) > 21);
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.energy).toBe(NINA.energyMax);
  walkTo(g, 34.5);
  climbUntil(g, 'up', () => g.nina.state === 'ground' && bottomOf(g) < 11);
  expect(bottomOf(g)).toBeCloseTo(10);
  walkTo(g, 28);
  expect(g.mission.tapes.has('lab-3#t0')).toBe(true);
  walkTo(g, 34.5);
  climbUntil(g, 'down', () => g.nina.state === 'ground' && bottomOf(g) > 21);
  walkTo(g, 10.5);
  climbUntil(g, 'up', () => g.nina.state === 'ground' && bottomOf(g) < 15);
  expect(bottomOf(g)).toBeCloseTo(14);
  run(g, { moveX: -1 }, 200, () => g.roomId === 'lab-2');
  expect(g.roomId).toBe('lab-2');
});

it('hall-1: огнемёт бьёт по люку в evm-1; главная ЭВМ его гасит', () => {
  const g = at('hall-1', 35.5, 22, true);
  expect(g.flamers).toHaveLength(1);
  g.flamers[0].t = FLAMER.off + 0.01; // сразу огонь
  run(g, {}, 30);
  expect(g.nina.energy).toBeLessThan(NINA.energyMax - FLAMER.dps * 0.4);
  const e = at('evm-1', 20, 22, true);
  stepGame(e, I({ usePressed: true }), DT);
  run(e, {}, 70);
  stepGame(e, I({ jump: true, jumpPressed: true }), DT); // пункт 0 — «ОТКЛ. ОГНЕМЁТ hall-1»
  expect(e.mission.flamersOff.has('hall-1')).toBe(true);
  enterRoom(e, 'hall-1');
  expect(e.flamers.every(f => f.off)).toBe(true);
});

it('без лестницы x30 на roof-3 лента на баке недостижима', () => {
  const rooms = loadRoomsFs();
  rooms.set('roof-3', patch(rooms.get('roof-3')!, Array.from({ length: 9 }, (_, i) => [30, 13 + i, '.'] as [number, number, string]).concat([[30, 12, '=']])));
  expect(unreachable(rooms, LANDINGS)).toEqual(['лента roof-3#t0']);
});
