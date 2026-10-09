import { expect, it } from 'vitest';
import { DT, NINA } from '../src/config';
import { createGame, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { loadWorld, validateMission } from '../src/world';
import { tileAt, validateWorld, type Room } from '../src/world/room';
import { parsePoints, parseTerminals } from '../src/world/spawns';
import { loadRoomsFs, roomOf } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const run = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) stepGame(g, I(p), DT);
};
const bottomOf = (g: Game) => g.nina.body.y + g.nina.body.h;

it('комнаты демо-карты читаются и связаны взаимно', () => {
  const rooms = loadRoomsFs();
  expect([...rooms.keys()].sort()).toEqual(['cave-1', 'evm-1', 'garage-1', 'lab-1', 'lab-2', 'power-1']);
  expect(validateWorld(rooms)).toEqual([]);
  expect(validateMission(rooms)).toEqual([]);
  expect(() => loadWorld()).not.toThrow();
});

it('validateMission: лент не 6, нет ЭВМ, терминал в никуда', () => {
  const r: Room = { ...roomOf({}), id: 'a', meta: { tapes: '1,2', terminals: '3,4 controls=zz' } };
  expect(validateMission(new Map([['a', r]]))).toEqual([
    'a: терминал гасит огнемёты несуществующей комнаты zz',
    'лент на карте 1, нужно 6',
    'главных ЭВМ на карте 0, нужна одна',
    'щитков на карте 0, нужен один',
    'мотоциклов на карте 0, нужен один',
  ]);
});

it('ленты, терминалы, щиток и мотоцикл стоят на полу, а не в стене', () => {
  for (const r of loadRoomsFs().values()) {
    const pts = [
      ...parsePoints(r.meta.tapes, r.id, 'ленты'), ...parseTerminals(r.meta.terminals, r.id),
      ...parsePoints(r.meta.switch, r.id, 'щитка'), ...parsePoints(r.meta.bike, r.id, 'мотоцикла'),
    ];
    for (const p of pts) {
      expect('#=H', `${r.id} ${p.x},${p.bottom}`).toContain(tileAt(r, Math.floor(p.x), p.bottom));
      expect(tileAt(r, Math.floor(p.x), p.bottom - 1), `${r.id} ${p.x},${p.bottom}`).not.toBe('#');
    }
  }
});

// Проходимость новых связей — настоящей физикой.
it('lab-2: по лестнице на платформу и вправо — в evm-1 на пол', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-2', x: 7.4, bottom: 22 });
  run(g, {}, 5);
  run(g, { up: true }, 300, () => g.nina.state === 'ground' && bottomOf(g) < 15);
  expect(bottomOf(g)).toBeCloseTo(14);
  run(g, { moveX: 1 }, 300, () => g.roomId === 'evm-1');
  run(g, {}, 30);
  expect(g.roomId).toBe('evm-1');
  expect(bottomOf(g)).toBeCloseTo(14);
});

it('evm-1: прыжок через шкаф и дальше в power-1; назад — в lab-2 на платформу', () => {
  const g = createGame(loadRoomsFs(), { room: 'evm-1', x: 1, bottom: 14 });
  run(g, {}, 5);
  run(g, { moveX: 1 }, 12);
  run(g, { moveX: 1, jump: true, jumpPressed: true }, 1);
  run(g, { moveX: 1, jump: true }, 40);
  expect(g.nina.body.x).toBeGreaterThan(10);
  run(g, { moveX: 1 }, 300, () => g.roomId === 'power-1');
  run(g, {}, 30);
  expect(g.roomId).toBe('power-1');
  expect(bottomOf(g)).toBeCloseTo(14);
  const back = createGame(loadRoomsFs(), { room: 'evm-1', x: 5, bottom: 14 });
  run(back, {}, 5);
  run(back, { moveX: -1 }, 300, () => back.roomId === 'lab-2');
  run(back, {}, 30);
  expect(back.roomId).toBe('lab-2');
  expect(bottomOf(back)).toBeCloseTo(14);
});

it('ленты на платформах evm-1 и power-1 берутся прыжком с места', () => {
  for (const [room, x] of [['evm-1', 32.4], ['power-1', 33.4]] as const) {
    const g = createGame(loadRoomsFs(), { room, x, bottom: 14 });
    run(g, {}, 5);
    run(g, { jump: true, jumpPressed: true }, 1);
    run(g, { jump: true }, 60);
    expect(bottomOf(g), room).toBeCloseTo(11);
    expect(g.mission.tapes.has(`${room}#t0`), room).toBe(true);
  }
});

it('power-1 ↔ garage-1 по лестнице без урона', () => {
  const g = createGame(loadRoomsFs(), { room: 'power-1', x: 26.9, bottom: 14 });
  run(g, {}, 5);
  run(g, { down: true }, 900, () => g.roomId === 'garage-1' && g.nina.state === 'ground');
  expect(g.roomId).toBe('garage-1');
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.energy).toBe(NINA.energyMax);
  run(g, { up: true }, 900, () => g.roomId === 'power-1' && g.nina.state === 'ground');
  expect(g.roomId).toBe('power-1');
  expect(bottomOf(g)).toBeCloseTo(14);
});

it('lab-1: лента на платформе — по лестнице; cave-1: лента за водой', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 29.7, bottom: 22 });
  run(g, {}, 5);
  run(g, { up: true }, 300, () => g.nina.state === 'ground' && bottomOf(g) < 15);
  run(g, { moveX: -1 }, 120, () => g.mission.tapes.size > 0);
  expect(g.mission.tapes.has('lab-1#t0')).toBe(true);
  const c = createGame(loadRoomsFs(), { room: 'cave-1', x: 18.7, bottom: 23 });
  run(c, {}, 5);
  run(c, { moveX: -1 }, 200, () => c.mission.tapes.size > 0);
  expect(c.mission.tapes.has('cave-1#t0')).toBe(true);
  expect(c.nina.dead).toBe(false);
});
