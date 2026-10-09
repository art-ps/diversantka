import { describe, expect, it } from 'vitest';
import { MISSION } from '../src/config';
import {
  createMission, enterTapes, formatTime, missionResult, restoreCheckpoint, saveCheckpoint, startBike, tickTimer, useSwitch,
} from '../src/sim/mission';

const START = { room: 'lab-1', x: 4, bottom: 22 };
const six = (m: ReturnType<typeof createMission>) => { for (let i = 0; i < MISSION.tapes; i++) m.tapes.add(`r#t${i}`); };

describe('таймер', () => {
  it('идёт; на нуле — провал, дальше не уходит', () => {
    const m = createMission(START);
    tickTimer(m, 1);
    expect(m.timeLeft).toBeCloseTo(MISSION.time - 1);
    expect(m.result).toBeNull();
    tickTimer(m, MISSION.time);
    expect(m.timeLeft).toBe(0);
    expect(m.result).toBe('failed');
    tickTimer(m, 1);
    expect(m.timeLeft).toBe(0);
  });

  it('после победы стоит', () => {
    const m = createMission(START);
    six(m); enterTapes(m); useSwitch(m); startBike(m);
    const left = m.timeLeft;
    tickTimer(m, 5);
    expect(m.timeLeft).toBe(left);
    expect(m.result).toBe('won');
  });

  it('formatTime: мм:сс, неполная секунда вверх', () => {
    expect(formatTime(MISSION.time)).toBe('15:00');
    expect(formatTime(59.2)).toBe('01:00');
    expect(formatTime(61)).toBe('01:01');
    expect(formatTime(0)).toBe('00:00');
  });
});

describe('порядок: ленты → ЭВМ → забор → мотоцикл', () => {
  it('ЭВМ не принимает меньше 6 лент', () => {
    const m = createMission(START);
    for (let i = 0; i < 5; i++) m.tapes.add(`r#t${i}`);
    expect(enterTapes(m)).toBe('НЕДОСТАТОЧНО ЛЕНТ 5/6');
    expect(m.tapesIn).toBe(false);
    m.tapes.add('r#t5');
    expect(enterTapes(m)).toBe('ЛЕНТЫ ВВЕДЕНЫ');
    expect(m.tapesIn).toBe(true);
  });

  it('щиток до ввода лент закрыт', () => {
    const m = createMission(START);
    six(m);
    expect(useSwitch(m)).toBe('ДОСТУП ЗАКРЫТ');
    expect(m.fenceOff).toBe(false);
    enterTapes(m);
    expect(useSwitch(m)).toBe('ЗАБОР ВЫКЛЮЧЕН');
    expect(m.fenceOff).toBe(true);
  });

  it('мотоцикл не проезжает включённый забор', () => {
    const m = createMission(START);
    six(m); enterTapes(m);
    expect(startBike(m)).toBe(false);
    expect(m.result).toBeNull();
    useSwitch(m);
    expect(startBike(m)).toBe(true);
    expect(m.result).toBe('won');
  });
});

describe('чекпоинт', () => {
  it('восстанавливает ленты, флаги и таймер; удары не откатывает', () => {
    const m = createMission(START);
    m.tapes.add('a#t0');
    m.flamersOff.add('lab-2');
    tickTimer(m, 100);
    saveCheckpoint(m, { room: 'lab-2', x: 25.4, bottom: 22 });
    m.tapes.add('b#t0');
    m.flamersOff.add('evm-1');
    m.tapesIn = true;
    m.fenceOff = true;
    m.hits = 3;
    tickTimer(m, 50);
    expect(restoreCheckpoint(m)).toEqual({ room: 'lab-2', x: 25.4, bottom: 22 });
    expect([...m.tapes]).toEqual(['a#t0']);
    expect([...m.flamersOff]).toEqual(['lab-2']);
    expect(m.tapesIn).toBe(false);
    expect(m.fenceOff).toBe(false);
    expect(m.timeLeft).toBeCloseTo(MISSION.time - 100);
    expect(m.hits).toBe(3);
  });

  it('до первого терминала чекпоинт — старт миссии с полным таймером', () => {
    const m = createMission(START);
    m.tapes.add('a#t0');
    tickTimer(m, 30);
    expect(restoreCheckpoint(m)).toEqual(START);
    expect(m.tapes.size).toBe(0);
    expect(m.timeLeft).toBe(MISSION.time);
  });

  it('повторное восстановление не делит множества с чекпоинтом', () => {
    const m = createMission(START);
    restoreCheckpoint(m);
    m.tapes.add('x');
    expect(restoreCheckpoint(m)).toEqual(START);
    expect(m.tapes.size).toBe(0);
  });
});

it('итог: время по таймеру миссии, ленты, удары, источник, строка', () => {
  const m = createMission(START);
  six(m);
  m.hits = 4;
  tickTimer(m, 192);
  const r = missionResult(m);
  expect(r).toMatchObject({ time: '03:12', tapes: '6/6', hits: 4, secret: false });
  expect(r.line).toBe('Диверсантка · миссия выполнена за 03:12 · ленты 6/6 · ударов 4 · источник найден: нет');
});
