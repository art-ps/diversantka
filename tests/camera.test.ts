import { describe, expect, it } from 'vitest';
import { CAMERA, DT, MISSION, NINA } from '../src/config';
import { createGame, enterRoom, liveRoom, stepGame, type Game } from '../src/game';
import { STR } from '../src/i18n';
import { IDLE, type Intent } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { PAL } from '../src/render/palette';
import { drawCameras, drawGates } from '../src/render/scene';
import { cameraAngle, traceBeam } from '../src/sim/camera';
import { solidRoom } from '../src/sim/doors';
import { menuItems } from '../src/sim/terminal';
import type { Room } from '../src/world/room';
import { validateCameras } from '../src/world';
import { parseCameras } from '../src/world/spawns';
import { FLOOR, roomOf } from './helpers';

const R = (id: string, rows: Record<number, string>, meta: Record<string, string> = {}, exits: Room['exits'] = {}): Room => ({ ...roomOf(rows, exits), id, meta });
const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const hold = (g: Game, p: Partial<Intent>, s: number) => { for (let i = 0; i < Math.round(s / DT); i++) stepGame(g, I(p), DT); };
const standAt = (g: Game, x: number) => {
  Object.assign(g.nina.body, { x: x - NINA.w / 2, y: 22 - NINA.h, vx: 0, vy: 0 });
  hold(g, {}, 0.1);
};

// Пол — строка 22; решётка A в колонке 30, строки 18–21, над ней стена; камера смотрит вправо вдоль строки camRow.
const gateRows = (): Record<number, string> => {
  const rows: Record<number, string> = { 22: FLOOR };
  for (let r = 1; r < 22; r++) rows[r] = '.'.repeat(30) + (r < 18 ? '#' : 'A');
  return rows;
};
const world = (camRow: number | null, meta: Record<string, string> = {}) =>
  new Map([['a', R('a', gateRows(), { ...(camRow === null ? {} : { cameras: `0,${camRow} arc=90..90 period=1` }), ...meta })]]);
const game = (camRow: number | null, meta: Record<string, string> = {}) => {
  const g = createGame(world(camRow, meta), { room: 'a', x: 24, bottom: 22 });
  hold(g, {}, 0.1);
  return g;
};

describe('камеры: валидация', () => {
  it('камера в «#», «S» или «=» — ошибка загрузки; в фоне — нет', () => {
    const rooms = (ch: string) => new Map([['a', R('a', { 10: ch.repeat(10) }, { cameras: '5,10 arc=0..0 period=1' })]]);
    expect(validateCameras(rooms('.'))).toEqual([]);
    for (const ch of ['#', 'S', '=']) expect(validateCameras(rooms(ch))).toEqual(['a: камера 5,10 в стене']);
  });
});

describe('камеры: шапка и угол', () => {
  it('«x,y arc=a..b period=p» через «;»', () => {
    expect(parseCameras('20,8 arc=-60..30 period=4 ; 5,2 arc=0..0 period=1.5', 'a')).toEqual([
      { x: 20, y: 8, arc: [-60, 30], period: 4 },
      { x: 5, y: 2, arc: [0, 0], period: 1.5 },
    ]);
    expect(parseCameras(undefined, 'a')).toEqual([]);
  });

  it('ошибки: веер наоборот, без периода, угол за 90°, вне комнаты', () => {
    for (const s of ['20,8 arc=30..-60 period=4', '20,8 arc=-60..30', '20,8 arc=-100..0 period=4', '40,8 arc=0..0 period=1']) {
      expect(() => parseCameras(s, 'r'), s).toThrow(`r: плохая запись камеры «${s}»`);
    }
  });

  it('качание туда-обратно за период — функция времени', () => {
    const c = { x: 0, y: 0, arc: [-60, 30] as [number, number], period: 4 };
    expect(cameraAngle(c, 0)).toBeCloseTo(-60);
    expect(cameraAngle(c, 1)).toBeCloseTo(-15);
    expect(cameraAngle(c, 2)).toBeCloseTo(30);
    expect(cameraAngle(c, 3)).toBeCloseTo(-15);
    expect(cameraAngle(c, 4)).toBeCloseTo(-60);
    expect(cameraAngle(c, 5)).toBeCloseTo(cameraAngle(c, 1));
  });
});

describe('луч', () => {
  const down = { x: 10, y: 2, arc: [0, 0] as [number, number], period: 1 };
  it('идёт до первого «#», «S», «=» или закрытой двери; открытая дверь и фон пропускают', () => {
    for (const t of ['#', 'S', '=']) {
      const end = traceBeam(R('a', { 10: '.'.repeat(10) + t }), down, 0);
      expect(end.y, t).toBeLessThan(10);
      expect(end.y, t).toBeGreaterThan(9.8);
    }
    const door = R('a', { 10: '.'.repeat(10) + '1' });
    expect(traceBeam(solidRoom(door, new Set()), down, 0).y).toBeLessThan(10);
    expect(traceBeam(solidRoom(door, new Set(['a#1'])), down, 0).y).toBeGreaterThan(24.8);
  });

  it('target задет — hit', () => {
    const r = R('a', {});
    expect(traceBeam(r, down, 0, { x: 10, y: 15, w: 1, h: 1 }).hit).toBe(true);
    expect(traceBeam(r, down, 0, { x: 12, y: 15, w: 1, h: 1 }).hit).toBe(false);
  });
});

describe('тревога', () => {
  it('стоя в луче: до 0.3 с тихо, после — тревога на 20 с и сирена', () => {
    const g = game(19); // уже 0.1 с в луче
    g.sfx = [];
    hold(g, {}, 0.15);
    expect(g.alarmT).toBe(0);
    hold(g, {}, 0.1);
    expect(g.alarmT).toBeGreaterThan(CAMERA.alarm - 0.2);
    expect(g.sfx).toContain('alarm');
  });

  it('присед уводит голову из луча на высоте груди — тревоги нет', () => {
    const g = game(19);
    hold(g, { down: true }, 2);
    expect(g.nina.crouching).toBe(true);
    expect(g.alarmT).toBe(0);
  });

  it('ноги в луче не считаются', () => {
    const g = game(21);
    hold(g, {}, 2);
    expect(g.alarmT).toBe(0);
  });

  it('сирена — раз в секунду тревоги', () => {
    const g = game(19);
    hold(g, {}, 0.4); // тревога
    g.sfx = [];
    hold(g, { down: true }, 3.5);
    expect(g.sfx.filter(s => s === 'alarm').length).toBeGreaterThanOrEqual(3);
    expect(g.sfx.filter(s => s === 'alarm').length).toBeLessThanOrEqual(4);
  });

  it('сирена — раз в секунду, и пока героиня стоит в луче', () => {
    const g = game(19);
    hold(g, {}, 0.4); // тревога
    g.sfx = [];
    hold(g, {}, 3.5);
    expect(g.alarmT).toBe(CAMERA.alarm);
    expect(g.sfx.filter(s => s === 'alarm').length).toBeGreaterThanOrEqual(3);
    expect(g.sfx.filter(s => s === 'alarm').length).toBeLessThanOrEqual(4);
  });

  it('тревога, начатая в середине секунды, даёт ровно один сигнал за первые 0.9 с', () => {
    const g = game(19);
    hold(g, { down: true }, 0.98); // часы миссии — около границы секунды
    g.sfx = [];
    for (let i = 0; i < 120 && g.alarmT === 0; i++) stepGame(g, IDLE, DT); // встала — тревога
    expect(g.alarmT).toBeGreaterThan(0);
    hold(g, { down: true }, 0.9); // ушла из луча: тревога идёт сама
    expect(g.alarmT).toBeLessThan(CAMERA.alarm);
    expect(g.sfx.filter(s => s === 'alarm')).toHaveLength(1);
  });

  it('повторное попадание в луч продлевает тревогу снова до 20 с', () => {
    const g = game(19);
    hold(g, {}, 0.5);
    expect(g.alarmT).toBe(CAMERA.alarm);
    hold(g, { down: true }, 3);
    expect(g.alarmT).toBeLessThan(CAMERA.alarm - 2);
    hold(g, {}, 0.6);
    expect(g.alarmT).toBe(CAMERA.alarm);
  });

  it('тревога кончается через 20 с без луча; андроид другого этажа в тревоге идёт на героиню', () => {
    const rows = gateRows();
    rows[14] = '='.repeat(30) + '#'; // этаж андроида над героиней
    const g = createGame(new Map([['a', R('a', rows, { cameras: '0,19 arc=90..90 period=1', enemies: 'android@10,14 patrol=4..20' })]]), { room: 'a', x: 24, bottom: 22 });
    hold(g, {}, 0.1);
    expect(g.androids[0].state).toBe('patrol');
    hold(g, {}, 0.3);
    expect(g.alarmT).toBeGreaterThan(0);
    hold(g, { down: true }, 0.2);
    expect(g.androids[0].state).not.toBe('patrol'); // идёт на героиню или уже бросает нож
    hold(g, { down: true }, CAMERA.alarm);
    expect(g.alarmT).toBe(0);
  });

  it('тревога не выходит за комнату', () => {
    const rooms = new Map([['a', R('a', gateRows(), {}, { left: 'b' })], ['b', R('b', { 22: FLOOR }, {}, { right: 'a' })]]);
    const g = createGame(rooms, { room: 'a', x: 24, bottom: 22 });
    g.alarmT = CAMERA.alarm;
    hold(g, {}, 1);
    expect(g.gate).toBe(1);
    enterRoom(g, 'b');
    expect(g.alarmT).toBe(0);
    expect(g.gate).toBe(0);
  });
});

describe('решётка', () => {
  it('при тревоге за 0.5 с становится стеной, после тревоги — снова проход', () => {
    const g = game(null);
    g.alarmT = CAMERA.alarm;
    hold(g, {}, CAMERA.gateTime / 2);
    expect(liveRoom(g).tiles[18][30]).toBe('#');
    expect(liveRoom(g).tiles[21][30]).toBe('.');
    hold(g, {}, CAMERA.gateTime / 2 + DT);
    for (let r = 18; r < 22; r++) expect(liveRoom(g).tiles[r][30]).toBe('#');
    standAt(g, 36);
    hold(g, { moveX: -1 }, 1);
    expect(g.nina.body.x).toBeGreaterThanOrEqual(31 - 1e-6);
    hold(g, {}, CAMERA.alarm);
    expect(g.gate).toBe(0);
    hold(g, { moveX: -1 }, 1);
    expect(g.nina.body.x).toBeLessThan(30);
  });

  it('не давит: шедшую вправо выталкивает назад, влево — назад вправо', () => {
    const g = game(null);
    standAt(g, 30.5);
    g.alarmT = CAMERA.alarm;
    hold(g, { moveX: 1 }, CAMERA.gateTime + 0.1);
    expect(g.nina.body.x + g.nina.body.w).toBeLessThanOrEqual(30);
    expect(g.nina.dead).toBe(false);

    const h = game(null);
    standAt(h, 30.5);
    h.nina.facing = -1;
    h.alarmT = CAMERA.alarm;
    hold(h, {}, CAMERA.gateTime + 0.1);
    expect(h.nina.body.x).toBeGreaterThanOrEqual(31);
    expect(h.nina.dead).toBe(false);
  });
});

describe('выключение с терминала', () => {
  it('меню: по комнате controls — огнемёт и/или камеры; выбор камер гасит их и пишется в чекпоинт', () => {
    const term = { x: 4, bottom: 22, controls: ['a', 'b'], main: false };
    const has = (r: string) => ({ flamers: r === 'b', cameras: r === 'a' });
    expect(menuItems(term, has).map(i => i.label)).toEqual(['ОТКЛ. КАМЕРЫ a', 'ОТКЛ. ОГНЕМЁТ b', 'ВЫХОД']);
    expect(menuItems(term).map(i => i.label)).toEqual(['ОТКЛ. ОГНЕМЁТ a', 'ОТКЛ. ОГНЕМЁТ b', 'ВЫХОД']); // первая миссия — как было

    const g = game(19, { terminals: '24,22 controls=a' }); // в луче 0.1 с — меньше detect
    stepGame(g, I({ usePressed: true }), DT);
    expect(g.screen?.items.map(i => i.label)).toEqual(['ОТКЛ. КАМЕРЫ a', 'ВЫХОД']);
    hold(g, {}, MISSION.bootTime);
    stepGame(g, I({ jumpPressed: true, jump: true }), DT);
    expect(g.screen?.msg).toBe(STR.ru.cameraOff('a'));
    expect(g.mission.checkpoint.camerasOff).toEqual(['a']);
    stepGame(g, I({ downPressed: true }), DT);
    stepGame(g, I({ jumpPressed: true, jump: true }), DT);
    expect(g.screen).toBeNull();
    expect(g.cameras[0].off).toBe(true);
    hold(g, {}, 2);
    expect(g.alarmT).toBe(0);
    enterRoom(g, 'a'); // снова в комнату — камеры по-прежнему выключены
    expect(g.cameras[0].off).toBe(true);
  });
});

describe('гибель', () => {
  it('выключенные камеры остаются выключенными, тревога и решётка сброшены', () => {
    const g = game(19, { terminals: '24,22 controls=a' });
    stepGame(g, I({ usePressed: true }), DT);
    hold(g, {}, MISSION.bootTime);
    stepGame(g, I({ jumpPressed: true, jump: true }), DT); // ОТКЛ. КАМЕРЫ a
    stepGame(g, I({ downPressed: true }), DT);
    stepGame(g, I({ jumpPressed: true, jump: true }), DT); // ВЫХОД
    expect(g.screen).toBeNull();
    g.alarmT = 10;
    g.gate = 0.7;
    g.nina.dead = true;
    g.nina.deadT = NINA.respawnDelay;
    stepGame(g, I({ jumpPressed: true, jump: true }), DT);
    expect(g.nina.dead).toBe(false);
    expect(g.mission.camerasOff.has('a')).toBe(true);
    expect(g.cameras[0].off).toBe(true);
    expect(g.alarmT).toBe(0);
    expect(g.gate).toBe(0);
  });
});

describe('рисунок', () => {
  it('камера «o», луч точками; при тревоге красный; решётка — «=» сверху вниз', () => {
    const g = game(19);
    const collect = () => {
      const out: { ch: string; c: readonly number[] }[] = [];
      drawCameras({ push: (_x, _y, ch, c) => { out.push({ ch, c }); } }, g, liveRoom(g), 0, 0);
      return out;
    };
    const calm = collect();
    expect(calm[0].ch).toBe('o');
    expect(calm.length).toBeGreaterThan(40);
    expect(calm.every(p => p.c === PAL.beam)).toBe(true);
    for (const p of calm) expect(CHARSET).toContain(p.ch);
    g.alarmT = CAMERA.alarm;
    expect(collect().every(p => p.c === PAL.danger)).toBe(true);

    const gates = (gate: number) => {
      g.gate = gate;
      const out: string[] = [];
      drawGates({ push: (_x, _y, ch) => { out.push(ch); } }, g, 0, 0);
      return out;
    };
    expect(gates(0)).toEqual(['-', '-']);
    expect(gates(0.5).filter(ch => ch === '=')).toHaveLength(8);
    expect(gates(1).filter(ch => ch === '=')).toHaveLength(16);
  });
});
