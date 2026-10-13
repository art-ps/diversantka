import { describe, expect, it } from 'vitest';
import { DT, PROLOGUE } from '../src/config';
import { createGame, createPrologue, stepGame } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { decodeIntent, encodeIntent, packRecord, unpackRecord } from '../src/sim/record';
import { loadRoomsFs } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const FLAGS = ['up', 'down', 'jump', 'jumpPressed', 'attackPressed', 'throwPressed', 'usePressed', 'upPressed', 'downPressed'] as const;

describe('кодек намерения', () => {
  it('decode(encode(x)) — тот же Intent с pausePressed: false', () => {
    const all = I({ moveX: -1, up: true, down: true, jump: true, jumpPressed: true, attackPressed: true, throwPressed: true, usePressed: true, pausePressed: true, upPressed: true, downPressed: true });
    expect(decodeIntent(encodeIntent(all))).toEqual({ ...all, pausePressed: false });
    expect(decodeIntent(encodeIntent(IDLE))).toEqual(IDLE);
    for (const f of FLAGS) expect(decodeIntent(encodeIntent(I({ [f]: true }))), f).toEqual(I({ [f]: true }));
  });

  it('moveX: −1, 0, 1 и доли стика в сотых — без потерь; вне −1…1 — край', () => {
    for (const mx of [-1, -0.7, -0.3, 0, 0.3, 0.7, 1]) expect(decodeIntent(encodeIntent(I({ moveX: mx }))).moveX).toBe(mx);
    expect(decodeIntent(encodeIntent(I({ moveX: 0.456 }))).moveX).toBe(0.46);
    expect(decodeIntent(encodeIntent(I({ moveX: 3 }))).moveX).toBe(1);
  });

  it('кривые коды не бросают: отрицательные, дробные, огромные', () => {
    for (const c of [-1, 1.5, 2 ** 40, Number.NaN]) expect(decodeIntent(c).pausePressed).toBe(false);
    expect(decodeIntent(-1)).toEqual(IDLE);
    expect(Math.abs(decodeIntent(255 * 512).moveX)).toBeLessThanOrEqual(1);
  });

  it('код вне 17 бит — покой, а не сворачивание по модулю; NaN в moveX — как 0', () => {
    expect(decodeIntent(2 ** 17)).toEqual(IDLE);
    expect(decodeIntent(201 * 512)).toEqual(IDLE);
    expect(encodeIntent({ ...IDLE, moveX: Number.NaN })).toBe(encodeIntent(IDLE));
  });
});

describe('Game.rec', () => {
  it('стартовый экран не пишется; полёт — по числу на шаг', () => {
    const g = createPrologue(loadRoomsFs(), true);
    stepGame(g, I({ moveX: 1 }), DT);
    stepGame(g, I({ jump: true, jumpPressed: true }), DT); // старт полёта
    expect(g.rec).toEqual([]);
    stepGame(g, I({ moveX: 1 }), DT);
    stepGame(g, IDLE, DT);
    expect(g.rec).toEqual([encodeIntent(I({ moveX: 1 })), encodeIntent(IDLE)]);
  });

  it('пауза: шаги, которые ставят, держат и снимают паузу, не пишутся', () => {
    const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 10, bottom: 22 });
    stepGame(g, IDLE, DT);
    stepGame(g, I({ pausePressed: true }), DT);
    stepGame(g, I({ moveX: 1 }), DT);
    stepGame(g, I({ pausePressed: true }), DT);
    expect(g.paused).toBe(false);
    stepGame(g, I({ moveX: -1 }), DT);
    expect(g.rec).toEqual([encodeIntent(IDLE), encodeIntent(I({ moveX: -1 }))]);
  });

  it('итог: шаги после конца миссии не пишутся', () => {
    const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 10, bottom: 22 });
    g.mission.result = 'won';
    stepGame(g, I({ usePressed: true }), DT);
    expect(g.rec).toEqual([]);
  });

  it('повтор пролога после всплеска начинает запись с нуля', () => {
    const g = createPrologue(loadRoomsFs());
    stepGame(g, IDLE, DT);
    expect(g.rec).toHaveLength(1);
    g.prologue!.phase = 'splash';
    g.prologue!.t = 0;
    for (let i = 0; i < Math.ceil(PROLOGUE.retryDelay / DT) + 1 && g.prologue!.phase === 'splash'; i++) stepGame(g, IDLE, DT);
    expect(g.prologue!.phase).toBe('fly');
    expect(g.prologue!.t).toBe(0);
    expect(g.rec).toEqual([]);
  });

  it('аналоговый стик: мир видит сотые, как реплей', () => {
    const a = createGame(loadRoomsFs(), { room: 'lab-1', x: 10, bottom: 22 });
    const b = createGame(loadRoomsFs(), { room: 'lab-1', x: 10, bottom: 22 });
    for (let i = 0; i < 30; i++) stepGame(a, I({ moveX: 0.4567 }), DT);
    for (const c of a.rec) stepGame(b, decodeIntent(c), DT);
    expect(b.nina.body.x).toBe(a.nina.body.x);
  });
});

describe('packRecord / unpackRecord', () => {
  it('пустая запись и длинные повторы — туда и обратно', async () => {
    expect(await unpackRecord(await packRecord([]))).toEqual([]);
    const rec = [...Array(5000).fill(100 << 9), ...Array(300).fill(encodeIntent(I({ moveX: 1, jump: true }))), 7, 7, 0];
    const s = await packRecord(rec);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await unpackRecord(s)).toEqual(rec);
  });

  it('порча — ошибка, а не зависание: мусор, чужая версия, обрезка', async () => {
    const s = await packRecord([1, 2, 3, 3, 3]);
    await expect(unpackRecord('не запись')).rejects.toThrow();
    await expect(unpackRecord('')).rejects.toThrow();
    await expect(unpackRecord('Ag' + s.slice(2))).rejects.toThrow(); // версия 2
    await expect(unpackRecord(s.slice(0, 4))).rejects.toThrow();
  });

  it('значение вне 17 бит — запись отвергается', async () => {
    await expect(unpackRecord(await packRecord([200 * 512 + 512]))).rejects.toThrow('bad code');
    expect(await unpackRecord(await packRecord([200 * 512 + 511]))).toEqual([200 * 512 + 511]);
  });
});
