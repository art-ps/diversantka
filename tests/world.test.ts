import { expect, it } from 'vitest';
import { DT, NINA } from '../src/config';
import { createGame, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { loadWorld, validateLifts, validateMission } from '../src/world';
import { layoutMap } from '../src/world/map';
import { tileAt, validateWorld, type Room } from '../src/world/room';
import { parsePoints, parseTerminals } from '../src/world/spawns';
import { PAL } from '../src/render/palette';
import { drawRoom } from '../src/render/scene';
import { loadRoomsFs, roomOf } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const run = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) stepGame(g, I(p), DT);
};
const bottomOf = (g: Game) => g.nina.body.y + g.nina.body.h;

it('комнаты демо-карты читаются и связаны взаимно', () => {
  const rooms = loadRoomsFs();
  expect([...rooms.keys()].sort()).toEqual(['cave-1', 'evm-1', 'garage-1', 'lab-1', 'lab-2', 'power-1', 'roof-1', 'sea-1', 'sea-2', 'secret-1', 'slope-1']);
  expect(validateWorld(rooms)).toEqual([]);
  expect(validateMission(rooms)).toEqual([]);
  expect(validateLifts(rooms)).toEqual([]);
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
    'источников на карте 0, нужен один',
  ]);
});

it('ленты, терминалы, щиток, мотоцикл и источник стоят на полу, а не в стене', () => {
  for (const r of loadRoomsFs().values()) {
    const pts = [
      ...parsePoints(r.meta.tapes, r.id, 'ленты'), ...parseTerminals(r.meta.terminals, r.id),
      ...parsePoints(r.meta.switch, r.id, 'щитка'), ...parsePoints(r.meta.bike, r.id, 'мотоцикла'),
      ...parsePoints(r.meta.source, r.id, 'источника'),
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

it('power-1 ↔ garage-1 на лифте без урона; E в гараже вызывает лифт', () => {
  const g = createGame(loadRoomsFs(), { room: 'power-1', x: 27.5 - NINA.w / 2, bottom: 14 });
  const lift = g.lifts[0];
  run(g, {}, 5);
  expect(lift).toMatchObject({ id: 'power-1', y: 14, rooms: ['power-1', 'garage-1'] });
  expect(bottomOf(g)).toBeCloseTo(14);
  run(g, { down: true }, 900, () => g.roomId === 'garage-1' && lift.target === null);
  run(g, {}, 30);
  expect(g.roomId).toBe('garage-1');
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.energy).toBe(NINA.energyMax);
  run(g, { up: true }, 900, () => g.roomId === 'power-1' && lift.target === null);
  run(g, {}, 30);
  expect(g.roomId).toBe('power-1');
  expect(bottomOf(g)).toBeCloseTo(14);
  // лифт наверху, героиня в гараже: E у шахты — приезжает
  const c = createGame(loadRoomsFs(), { room: 'garage-1', x: 24, bottom: 22 });
  run(c, {}, 5);
  run(c, { usePressed: true }, 1);
  run(c, {}, 900, () => c.lifts[0].target === null);
  expect(c.lifts[0].y).toBe(47);
  run(c, { moveX: 1 }, 100, () => c.nina.body.x + NINA.w / 2 >= 27.2);
  run(c, {}, 20);
  run(c, { up: true }, 900, () => c.roomId === 'power-1' && c.lifts[0].target === null);
  run(c, {}, 30);
  expect(c.roomId).toBe('power-1');
  expect(bottomOf(c)).toBeCloseTo(14);
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

it('validateMission: два источника — ошибка', () => {
  const rooms = loadRoomsFs();
  const cave = rooms.get('cave-1')!;
  rooms.set('cave-1', { ...cave, meta: { ...cave.meta, source: '10,23' } });
  expect(validateMission(rooms)).toEqual(['источников на карте 2, нужен один']);
});

it('cave-1: фальш-стена справа — стена на вид, другого оттенка', () => {
  const cave = loadRoomsFs().get('cave-1')!;
  const at = (c: number, r: number) => {
    const out: { ch: string; c: readonly number[] }[] = [];
    drawRoom({ push: (x, y, ch, col) => { if (Math.floor(x + 0.5) === c && Math.floor(y + 0.5) === r) out.push({ ch, c: col }); } }, cave, 0, 0, 0, 'cave-1');
    return out;
  };
  for (let r = 19; r <= 22; r++) {
    expect(tileAt(cave, 39, r)).toBe('S');
    const g = at(39, r);
    expect(g).toHaveLength(4);
    for (const p of g) {
      expect('#%&8').toContain(p.ch);
      expect(p.c).toBe(PAL.fake);
    }
  }
  expect(at(39, 10).every(p => p.c !== PAL.fake)).toBe(true);
  expect(PAL.fake).not.toEqual(PAL.wall);
});

it('cave-1 → secret-1 сквозь фальш-стену, к источнику и обратно', () => {
  const g = createGame(loadRoomsFs(), { room: 'cave-1', x: 30, bottom: 23 });
  g.dogs = []; // проверяем тайлы и переходы, не собаку
  run(g, {}, 5);
  run(g, { moveX: 1 }, 300, () => g.roomId === 'secret-1');
  run(g, {}, 30);
  expect(g.roomId).toBe('secret-1');
  expect(bottomOf(g)).toBeCloseTo(23);
  run(g, { moveX: 1 }, 300, () => g.mission.secret);
  expect(g.mission.secret).toBe(true);
  run(g, { moveX: -1 }, 600, () => g.roomId === 'cave-1');
  run(g, {}, 30);
  expect(g.roomId).toBe('cave-1');
  expect(bottomOf(g)).toBeCloseTo(23);
  expect(g.nina.energy).toBe(NINA.energyMax);
});

it('slope-1: со скалы вниз по уступам и в дверь lab-1 — без урона', () => {
  const g = createGame(loadRoomsFs(), { room: 'slope-1', x: 2, bottom: 14 });
  run(g, {}, 5);
  run(g, { moveX: 1 }, 600, () => g.roomId === 'lab-1');
  run(g, {}, 30);
  expect(g.roomId).toBe('lab-1');
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.energy).toBe(NINA.energyMax);
  run(g, { moveX: -1 }, 300, () => g.roomId === 'slope-1');
  run(g, {}, 30);
  expect(g.roomId).toBe('slope-1');
  expect(bottomOf(g)).toBeCloseTo(22);
});

it('slope-1: с козырька над дверью вправо не пройти — в lab-1 там стена', () => {
  const g = createGame(loadRoomsFs(), { room: 'slope-1', x: 37, bottom: 14 });
  run(g, {}, 5);
  run(g, { moveX: 1 }, 120);
  expect(g.roomId).toBe('slope-1');
  expect(bottomOf(g)).toBeCloseTo(14);
});

it('roof-1 ↔ lab-1 через люк по лестнице, без урона', () => {
  const g = createGame(loadRoomsFs(), { room: 'roof-1', x: 2.9, bottom: 22 });
  run(g, {}, 5);
  run(g, { down: true }, 900, () => g.roomId === 'lab-1' && g.nina.state === 'ground');
  expect(g.roomId).toBe('lab-1');
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.energy).toBe(NINA.energyMax);
  run(g, { up: true }, 900, () => g.roomId === 'roof-1' && g.nina.state === 'ground');
  expect(g.roomId).toBe('roof-1');
  expect(bottomOf(g)).toBeCloseTo(22);
});

it('карта паузы: все комнаты миссии раскладываются по выходам без конфликтов', () => {
  const rooms = loadRoomsFs();
  const { pos, conflicts } = layoutMap(rooms, 'roof-1');
  expect(conflicts).toEqual([]);
  expect([...rooms.keys()].filter(id => !pos.has(id)).sort()).toEqual(['sea-1', 'sea-2']);
});
