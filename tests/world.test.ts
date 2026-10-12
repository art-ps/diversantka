import { expect, it } from 'vitest';
import { ANDROID, DOG, DT, MISSION, NINA } from '../src/config';
import { createGame, enterRoom, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { MAP_AREA, MAP_PX, MAP_PY } from '../src/render/map';
import { PAL } from '../src/render/palette';
import { drawRoom } from '../src/render/scene';
import { createLifts, LIFT_W } from '../src/sim/lift';
import { loadWorld, validateLifts, validateMission } from '../src/world';
import { layoutMap } from '../src/world/map';
import { tileAt, validateWorld, type Room } from '../src/world/room';
import { parseEnemies, parseItems, parsePoints, parseTerminals } from '../src/world/spawns';
import { loadRoomsFs, roomOf } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const run = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) stepGame(g, I(p), DT);
};
const bottomOf = (g: Game) => g.nina.body.y + g.nina.body.h;
const cx = (g: Game) => g.nina.body.x + g.nina.body.w / 2;
// Героиня центром в x на полу bottom комнаты room; враги не мешают, огнемёты выключены — проверяем тайлы и переходы.
const at = (room: string, x: number, bottom: number) => {
  const g = createGame(loadRoomsFs(), { room, x: x - NINA.w / 2, bottom });
  g.mission.flamersOff = new Set(['lab-2', 'hall-1']);
  enterRoom(g, room);
  g.androids = [];
  g.dogs = [];
  run(g, {}, 5);
  return g;
};
// По лестнице до комнаты to: держать dir, пока не встанет на пол в to.
const climbTo = (g: Game, dir: 'up' | 'down', to: string) => {
  run(g, { [dir]: true }, 1500, () => g.roomId === to && g.nina.state === 'ground');
  run(g, {}, 30);
  expect(g.roomId).toBe(to);
};

const ROOMS = [
  'arch-1', 'boiler', 'cave-1', 'cave-2', 'cave-3', 'corr-1', 'evm-1', 'evm-2', 'garage-1', 'hall-1', 'lab-1', 'lab-2',
  'lab-3', 'office', 'power-1', 'roof-1', 'roof-2', 'roof-3', 'sea-1', 'sea-2', 'secret-1', 'shaft-1', 'shaft-2', 'shaft-bot',
  'shaft-top', 'slope-1', 'store-1', 'store-2', 'store-3',
];


it('комнаты карты читаются и связаны взаимно', () => {
  const rooms = loadRoomsFs();
  expect([...rooms.keys()].sort()).toEqual(ROOMS);
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

it('validateMission: два источника — ошибка', () => {
  const rooms = loadRoomsFs();
  const cave = rooms.get('cave-1')!;
  rooms.set('cave-1', { ...cave, meta: { ...cave.meta, source: '10,23' } });
  expect(validateMission(rooms)).toEqual(['источников на карте 2, нужен один']);
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

it('терминалы: lab-2 гасит свои огнемёты, главная ЭВМ evm-1 — огнемёты hall-1; office и store-1 — чекпоинты', () => {
  const rooms = loadRoomsFs();
  const terms = Object.fromEntries([...rooms.values()].filter(r => r.meta.terminals).map(r => [r.id, parseTerminals(r.meta.terminals, r.id)]));
  expect(terms).toEqual({
    'lab-2': [{ x: 26, bottom: 22, controls: ['lab-2'], main: false }],
    office: [{ x: 20, bottom: 22, controls: [], main: false }],
    'evm-1': [{ x: 20, bottom: 22, controls: ['hall-1'], main: true }],
    'store-1': [{ x: 20, bottom: 22, controls: [], main: false }],
  });
});

// Враг не стоит на лестнице и в проёме двери: участок патруля плюс клетка — без лестниц и не у края комнаты.
it('патрули андроидов и собак не перекрывают лестницы и двери', () => {
  for (const r of loadRoomsFs().values()) {
    for (const e of parseEnemies(r.meta.enemies, r.id)) {
      if (e.kind === 'flamer') continue;
      const [a, b] = e.patrol;
      for (let c = Math.floor(a - 1); c <= Math.ceil(b + 1); c++) {
        for (let row = e.bottom - 4; row <= e.bottom; row++) expect(tileAt(r, c, row), `${r.id} ${e.kind} ${a}..${b}: лестница ${c},${row}`).not.toBe('H');
      }
      expect(a - 1, `${r.id} ${e.kind}: у левой двери`).toBeGreaterThan(1);
      expect(b + 1, `${r.id} ${e.kind}: у правой двери`).toBeLessThan(39);
    }
  }
});

it('у терминалов, щитка и мотоцикла нет предметов на том же полу и шахты лифта ближе useRange', () => {
  const rooms = loadRoomsFs();
  const lifts = createLifts(rooms);
  for (const r of rooms.values()) {
    const objs = [...parseTerminals(r.meta.terminals, r.id), ...parsePoints(r.meta.switch, r.id, 'щитка'), ...parsePoints(r.meta.bike, r.id, 'мотоцикла')];
    for (const o of objs) {
      for (const i of parseItems(r.meta.items, r.id).filter(i => i.bottom === o.bottom)) expect(Math.abs(i.x - o.x), `${r.id} ${i.kind}@${i.x}`).toBeGreaterThan(MISSION.useRange);
      for (const l of lifts.filter(l => l.rooms.includes(r.id))) expect(Math.abs(l.x + LIFT_W / 2 - o.x), `${r.id}: шахта ${l.id}`).toBeGreaterThan(MISSION.useRange + LIFT_W / 2);
    }
  }
});

// Удар ногой — «вверх + удар»: на платформе он же везёт лифт. Враги в комнатах шахты не должны видеть площадку.
it('враги в комнатах шахты лифта не видят его площадку', () => {
  const rooms = loadRoomsFs();
  for (const l of createLifts(rooms)) {
    const mid = l.x + LIFT_W / 2;
    for (const id of l.rooms) {
      for (const e of parseEnemies(rooms.get(id)!.meta.enemies, id)) {
        if (e.kind === 'flamer') continue;
        const [a, b] = e.patrol;
        const sight = e.kind === 'dog' ? DOG.sight : ANDROID.sight;
        expect(Math.max(a - mid, mid - b), `${id} ${e.kind} ${a}..${b}`).toBeGreaterThan(sight);
      }
    }
  }
});

it('карта паузы: все комнаты раскладываются без конфликтов от крыши и от склона и влезают в область карты', () => {
  const rooms = loadRoomsFs();
  for (const root of ['roof-1', 'slope-1']) {
    const { pos, conflicts } = layoutMap(rooms, root);
    expect(conflicts, root).toEqual([]);
    expect([...rooms.keys()].filter(id => !pos.has(id)).sort(), root).toEqual(['sea-1', 'sea-2']);
    const xs = [...pos.values()].map(p => p.x), ys = [...pos.values()].map(p => p.y);
    const w = (Math.max(...xs) - Math.min(...xs)) * MAP_PX + 2, h = (Math.max(...ys) - Math.min(...ys)) * MAP_PY + 1;
    expect(w, root).toBeLessThanOrEqual(MAP_AREA.x1 - MAP_AREA.x0 + 1);
    expect(h, root).toBeLessThanOrEqual(MAP_AREA.y1 - MAP_AREA.y0 + 1);
  }
});

// Проходимость связей — настоящей физикой.
it('roof-1 → roof-2 сквозь решётку основания мачты и назад, без урона', () => {
  const g = at('roof-1', 30, 22);
  run(g, { moveX: 1 }, 300, () => g.roomId === 'roof-2');
  run(g, {}, 30);
  expect(g.roomId).toBe('roof-2');
  expect(bottomOf(g)).toBeCloseTo(22);
  run(g, { moveX: -1 }, 60, () => g.roomId === 'roof-1');
  run(g, {}, 30);
  expect(g.roomId).toBe('roof-1');
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.energy).toBe(NINA.energyMax);
});

it('roof-1 ↔ lab-2 через люк по лестнице, без урона', () => {
  const g = at('roof-1', 3.5, 22);
  climbTo(g, 'down', 'lab-2');
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.energy).toBe(NINA.energyMax);
  climbTo(g, 'up', 'roof-1');
  expect(bottomOf(g)).toBeCloseTo(22);
});

it('lab-1: лестница x3 кончается на антресоли — люка на крышу больше нет', () => {
  const g = at('lab-1', 3.5, 22);
  run(g, { up: true }, 600, () => g.nina.state === 'ground' && bottomOf(g) < 15);
  run(g, { up: true }, 120);
  expect(g.roomId).toBe('lab-1');
  expect(bottomOf(g)).toBeCloseTo(14);
});

it('lab-2 ↔ lab-3 по верхнему этажу; store-2 ↔ store-3 по антресоли', () => {
  for (const [a, b] of [['lab-2', 'lab-3'], ['store-2', 'store-3']]) {
    const g = at(a, 36, 14);
    run(g, { moveX: 1 }, 300, () => g.roomId === b);
    run(g, {}, 30);
    expect(g.roomId, a).toBe(b);
    expect(bottomOf(g), a).toBeCloseTo(14);
    run(g, { moveX: -1 }, 120, () => g.roomId === a);
    run(g, {}, 30);
    expect(g.roomId, b).toBe(a);
    expect(bottomOf(g), b).toBeCloseTo(14);
  }
});

it('вертикальные связи по лестницам — вниз и вверх без урона', () => {
  for (const [top, x, low] of [['lab-2', 35.5, 'office'], ['hall-1', 35.5, 'evm-1'], ['arch-1', 4.5, 'store-1'], ['evm-1', 6.5, 'evm-2'], ['evm-2', 12.5, 'shaft-top']] as const) {
    const g = at(top, x, 22);
    climbTo(g, 'down', low);
    expect(bottomOf(g), top).toBeCloseTo(22);
    climbTo(g, 'up', top);
    expect(bottomOf(g), low).toBeCloseTo(22);
    expect(g.nina.energy, top).toBe(NINA.energyMax);
  }
});

it('лифт shaft-top → shaft-1 → shaft-2 → shaft-bot: остановка на каждом этаже, назад наверх без урона', () => {
  const g = at('shaft-top', 27.5, 22);
  const lift = g.lifts[0];
  expect(lift).toMatchObject({ id: 'shaft-top', y: 22, stops: [22, 47, 72, 97], rooms: ['shaft-top', 'shaft-1', 'shaft-2', 'shaft-bot'] });
  for (const room of ['shaft-1', 'shaft-2', 'shaft-bot']) {
    run(g, { down: true }, 900, () => g.roomId === room && lift.target === null && !g.transition);
    run(g, {}, 40);
    expect(g.roomId).toBe(room);
    expect(bottomOf(g), room).toBeCloseTo(22);
  }
  run(g, { up: true }, 3000, () => g.roomId === 'shaft-top' && lift.target === null && !g.transition);
  run(g, {}, 40);
  expect(g.roomId).toBe('shaft-top');
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.energy).toBe(NINA.energyMax);
});

it('shaft-1: шахта без лифта — пропасть; E у края вызывает лифт, на нём стоят', () => {
  const fall = at('shaft-1', 25, 22);
  run(fall, { moveX: 1 }, 600, () => fall.nina.dead);
  expect(fall.nina.dead).toBe(true);
  const g = at('shaft-1', 25, 22);
  run(g, { usePressed: true }, 1);
  run(g, {}, 900, () => g.lifts[0].target === null && g.lifts[0].y === 47);
  expect(g.lifts[0].y).toBe(47);
  run(g, {}, 40);
  run(g, { moveX: 0.3 }, 60, () => cx(g) > 27.3);
  run(g, {}, 30);
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.dead).toBe(false);
});

it('shaft-bot: из ямы под лифтом — выпрыгнуть на пол и вызвать лифт', () => {
  const g = at('shaft-bot', 27.5, 22);
  run(g, {}, 30);
  expect(bottomOf(g)).toBeCloseTo(23); // лифт наверху — на дне шахты ступенька вниз
  run(g, { usePressed: true }, 1);
  run(g, {}, 30);
  expect(g.lifts[0].target).toBeNull(); // из ямы E не вызывает
  run(g, { moveX: -0.3, jump: true, jumpPressed: true }, 1);
  run(g, { moveX: -0.3, jump: true }, 20);
  run(g, {}, 20);
  expect(bottomOf(g)).toBeCloseTo(22);
  run(g, { usePressed: true }, 1);
  run(g, {}, 1500, () => g.lifts[0].target === null && g.lifts[0].y === 97);
  expect(g.lifts[0].y).toBe(97);
});

it('store-2 → secret-1 сквозь фальш-пол без урона, к источнику, сквозь фальш-стену в power-1 и обратно', () => {
  const g = at('store-2', 30, 22);
  run(g, { moveX: 1 }, 300, () => g.roomId === 'secret-1');
  run(g, {}, 60);
  expect(g.roomId).toBe('secret-1');
  expect(bottomOf(g)).toBeCloseTo(5);
  expect(g.nina.energy).toBe(NINA.energyMax);
  run(g, { moveX: -0.3 }, 300, () => Math.abs(g.nina.body.x + NINA.w / 2 - 30.5) < 0.2); // к люку уступа
  run(g, {}, 10);
  run(g, { down: true }, 600, () => g.nina.state === 'ground' && bottomOf(g) > 21);
  run(g, { moveX: -1 }, 300, () => g.mission.secret);
  expect(g.mission.secret).toBe(true);
  run(g, { moveX: 1 }, 600, () => g.roomId === 'power-1');
  run(g, {}, 30);
  expect(g.roomId).toBe('power-1');
  expect(bottomOf(g)).toBeCloseTo(22);
  run(g, { moveX: -1 }, 120, () => g.roomId === 'secret-1');
  run(g, {}, 30);
  expect(g.roomId).toBe('secret-1');
  expect(bottomOf(g)).toBeCloseTo(22);
});

it('фальш-пол store-2 и фальш-стена power-1 — стена на вид, другого оттенка', () => {
  const rooms = loadRoomsFs();
  const glyphsAt = (room: Room, c: number, r: number) => {
    const out: { ch: string; c: readonly number[] }[] = [];
    drawRoom({ push: (x, y, ch, col) => { if (Math.floor(x + 0.5) === c && Math.floor(y + 0.5) === r) out.push({ ch, c: col }); } }, room, 0, 0, 0, room.id);
    return out;
  };
  for (const [id, cells] of [['store-2', [[33, 22], [34, 23], [35, 23]]], ['power-1', [[0, 18], [0, 21]]]] as const) {
    const room = rooms.get(id)!;
    for (const [c, r] of cells) {
      expect(tileAt(room, c, r), `${id} ${c},${r}`).toBe('S');
      const g = glyphsAt(room, c, r);
      expect(g).toHaveLength(4);
      for (const p of g) {
        expect('#%&8').toContain(p.ch);
        expect(p.c).toBe(PAL.fake);
      }
    }
  }
  expect(glyphsAt(rooms.get('store-2')!, 20, 22).every(p => p.c !== PAL.fake)).toBe(true);
  expect(PAL.fake).not.toEqual(PAL.wall);
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
