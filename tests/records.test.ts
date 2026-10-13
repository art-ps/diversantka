import { describe, expect, it } from 'vitest';
import { DT, MISSION } from '../src/config';
import { createGame, stepGame } from '../src/game';
import { IDLE } from '../src/input/intent';
import { loadRecords, RECORDS_MAX, SAVE, saveRecord, type RecordRow } from '../src/save';
import { createMission, missionResult, restoreCheckpoint, tickTimer } from '../src/sim/mission';
import { loadRoomsFs } from './helpers';

// Фейковое хранилище: реальный localStorage в тестах не трогаем.
const store = (init: Record<string, string> = {}) => {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
};
const row = (seconds: number, p: Partial<RecordRow> = {}): RecordRow => ({ seconds, hits: 0, attacks: 0, secret: false, date: '2026-10-13', ...p });
const stone = (b: { x: number; y: number }, dx = 0.5, dy = 1) =>
  ({ kind: 'stone' as const, x: b.x + dx, y: b.y + dy, vx: 0.1, vy: 0, from: 'nina' as const, damage: 1, alive: true, hitWall: false });

describe('Mission.attacks', () => {
  it('попадание и добивание андроида — +1 каждое; блок не считается', () => {
    const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
    const a = g.androids[0];
    g.projectiles.push(stone(a.body));
    stepGame(g, IDLE, DT);
    expect(g.mission.attacks).toBe(1);
    g.projectiles.push(stone(a.body)); // андроид ещё неуязвим — «блок»
    stepGame(g, IDLE, DT);
    expect(g.floaters.map(f => f.text)).toContain('блок');
    expect(g.mission.attacks).toBe(1);
    a.invulnT = 0;
    a.hp = 1;
    g.projectiles.push(stone(a.body));
    stepGame(g, IDLE, DT);
    expect(g.mission.attacks).toBe(2);
  });

  it('собака — тоже попадание', () => {
    const g = createGame(loadRoomsFs(), { room: 'cave-1', x: 4, bottom: 22 });
    g.projectiles.push(stone(g.dogs[0].body, 0.8, 0.7));
    stepGame(g, IDLE, DT);
    expect(g.mission.attacks).toBe(1);
  });

  it('удар рукой и ногой по андроиду — +1', () => {
    for (const up of [false, true]) {
      const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
      const a = g.androids[0];
      for (let i = 0; i < 5; i++) stepGame(g, IDLE, DT); // героиня встаёт на пол
      a.body.x = g.nina.body.x + g.nina.body.w + 0.1;
      a.body.y = g.nina.body.y + g.nina.body.h - a.body.h;
      stepGame(g, { ...IDLE, attackPressed: true, up }, DT);
      for (let i = 0; i < 40; i++) stepGame(g, IDLE, DT);
      expect(g.mission.attacks, up ? 'нога' : 'рука').toBe(1);
    }
  });

  it('чекпоинт не откатывает attacks', () => {
    const m = createMission({ room: 'x', x: 0, bottom: 0 });
    m.attacks = 2;
    restoreCheckpoint(m);
    expect(m.attacks).toBe(2);
  });

  it('новая миссия — ноль', () => {
    expect(createMission({ room: 'x', x: 0, bottom: 0 }).attacks).toBe(0);
  });
});

it('итог: seconds числом, attacks, date — местный день', () => {
  const m = createMission({ room: 'x', x: 0, bottom: 0 });
  m.attacks = 3;
  tickTimer(m, 192.5);
  const r = missionResult(m, new Date(2026, 9, 6, 23, 59));
  expect(r).toMatchObject({ time: '03:13', seconds: 192.5, attacks: 3, date: '2026-10-06' });
  expect(MISSION.time - m.timeLeft).toBe(r.seconds);
});

describe('таблица рекордов', () => {
  it('пустое хранилище — пусто; первая запись — место 1, в JSON только числа, флаги и день', () => {
    const s = store();
    expect(loadRecords(s)).toEqual([]);
    expect(saveRecord(s, { ...row(300), line: 'лишнее', time: '05:00' } as RecordRow)).toBe(1);
    expect(JSON.parse(s.data.get(SAVE.records)!)).toEqual([row(300)]);
    expect(SAVE.records).toBe('diversantka.records');
  });

  it('сортировка по времени; при равном времени раньше записанная выше', () => {
    const s = store();
    saveRecord(s, row(300, { hits: 1 }));
    expect(saveRecord(s, row(200))).toBe(1);
    expect(saveRecord(s, row(300, { hits: 2 }))).toBe(3);
    expect(saveRecord(s, row(250))).toBe(2);
    expect(loadRecords(s).map(r => [r.seconds, r.hits])).toEqual([[200, 0], [250, 0], [300, 1], [300, 2]]);
  });

  it('не больше 10; не вошла — null и таблица не меняется; равная десятой — не входит', () => {
    const s = store();
    for (let i = 1; i <= RECORDS_MAX; i++) saveRecord(s, row(i * 10));
    expect(RECORDS_MAX).toBe(10);
    const before = s.data.get(SAVE.records);
    expect(saveRecord(s, row(100))).toBeNull();
    expect(saveRecord(s, row(500))).toBeNull();
    expect(s.data.get(SAVE.records)).toBe(before);
    expect(saveRecord(s, row(5))).toBe(1);
    const list = loadRecords(s);
    expect(list).toHaveLength(10);
    expect(list.at(-1)!.seconds).toBe(90);
  });

  it('недоступное или испорченное хранилище — рекордов нет, игра идёт', () => {
    expect(loadRecords(undefined)).toEqual([]);
    expect(saveRecord(undefined, row(1))).toBeNull();
    const throws = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
    expect(loadRecords(throws)).toEqual([]);
    expect(saveRecord(throws, row(1))).toBeNull();
    expect(loadRecords(store({ [SAVE.records]: '{не json' }))).toEqual([]);
    expect(loadRecords(store({ [SAVE.records]: '{"a":1}' }))).toEqual([]);
    expect(loadRecords(store({ [SAVE.records]: JSON.stringify([row(9), { seconds: 'x' }, null, row(3)]) }))).toEqual([row(3), row(9)]);
  });
});
