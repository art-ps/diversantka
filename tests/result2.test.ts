import { afterEach, describe, expect, it } from 'vitest';
import { DT, MISSION, ROOM_H } from '../src/config';
import { createArrival, createGame, stepGame, type Game } from '../src/game';
import { setLang } from '../src/i18n';
import { IDLE } from '../src/input/intent';
import { HEAT_RAMP } from '../src/fx/heat';
import { CHARSET } from '../src/render/atlas';
import { drawGame } from '../src/render/scene';
import { loadRecords, recordsKey, SAVE, saveRecord, type RecordRow } from '../src/save';
import { createMission, missionResult, type Mission } from '../src/sim/mission';
import { loadRoomsFs } from './helpers';

afterEach(() => setLang('ru'));

const store = () => {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
};
const row = (seconds: number): RecordRow => ({ seconds, hits: 0, attacks: 0, secret: false, date: '2026-10-14' });
const run = (g: Game, n: number) => { for (let i = 0; i < n; i++) stepGame(g, IDLE, DT); };
const setElapsed = (m: Mission, s: number) => { m.timeLeft = m.time - s; }; // elapsed = time − timeLeft + overtime
const FIRE_CH = new Set(HEAT_RAMP.slice(1)); // символы жара; рамка из «+», «=», «|» — только в строках 3–21
const shot = (g: Game) => {
  const pushes: { y: number; ch: string }[] = [], texts: string[] = [];
  drawGame({ push: (_x: number, y: number, ch: string) => { pushes.push({ y, ch }); }, text: (_x: number, _y: number, s: string) => { texts.push(s); } } as never, g, 1);
  return { pushes, texts };
};
// Победа в бункере: сцена приезда пройдена, 9:12 на часах, 4 удара, без боя.
const won2 = () => {
  const g = createArrival(loadRoomsFs('rooms2'));
  run(g, Math.round(MISSION.arriveTime / DT));
  setElapsed(g.mission, 9 * 60 + 12);
  g.mission.hits = 4;
  g.mission.result = 'won';
  return g;
};

describe('итог миссии 2', () => {
  it('строка — «Диверсантка · бункер · 09:12 · ударов 4 · без боя» (EN — bunker); лент нет', () => {
    const m = createMission({ room: 'gate', x: 9, bottom: 22 }, 'bomb', 12 * 60);
    setElapsed(m, 552);
    m.hits = 4;
    const r = missionResult(m);
    expect(r.tapes).toBeNull();
    expect(r.seconds).toBe(552);
    expect(r.line).toBe('Диверсантка · бункер · 09:12 · ударов 4 · без боя');
    setLang('en');
    expect(missionResult(m).line).toBe('Diversantka · bunker · 09:12 · hits 4 · no fight');
  });

  it('миссия 1 — прежняя строка с лентами', () => {
    const m = createMission({ room: 'lab-1', x: 4, bottom: 22 });
    setElapsed(m, 774);
    m.hits = 3;
    expect(missionResult(m).line).toBe('Диверсантка · 12:54 · ленты 0/6 · ударов 3 · без боя');
  });

  it('экран: заголовок, время, удары, отметки БЕЗ УРОНА/БЕЗ БОЯ без источника, строка; строки лент нет; символы — из атласа', () => {
    const g = won2();
    g.mission.hits = 0;
    run(g, Math.round(MISSION.outroTime / DT) + 1);
    const { texts, pushes } = shot(g);
    expect(texts).toEqual(expect.arrayContaining(['МИССИЯ ВЫПОЛНЕНА', 'ВРЕМЯ   09:12', 'УДАРОВ  0', 'БЕЗ УРОНА · БЕЗ БОЯ', 'ЛУЧШИЕ']));
    expect(texts.some(t => t.startsWith('ЛЕНТЫ'))).toBe(false);
    expect(texts.join(' ')).toContain('Диверсантка · бункер · 09:12 · ударов 0 · без урона · без боя');
    for (const t of texts) for (const ch of t) expect(CHARSET).toContain(ch);
    for (const p of pushes) expect(CHARSET).toContain(p.ch);
  });

  it('огонь фоном: языки жара под рамкой итогов, внутри рамки — ни одного; шевелится; на выезде и у миссии 1 его нет', () => {
    const g = won2();
    run(g, Math.round(MISSION.outroTime / DT) - 5);
    expect(shot(g).pushes.filter(p => FIRE_CH.has(p.ch) && p.y > 21)).toEqual([]); // ещё выезд
    run(g, 10);
    const fire = (s: ReturnType<typeof shot>) => s.pushes.filter(p => FIRE_CH.has(p.ch) && p.y + 0.5 > 21.5);
    const a = fire(shot(g));
    expect(a.length).toBeGreaterThan(20);
    for (const p of a) expect(p.y + 0.5).toBeGreaterThan(22);
    for (const p of a) expect(p.y + 0.5).toBeLessThan(ROOM_H);
    run(g, 30);
    expect(fire(shot(g))).not.toEqual(a);
    const m1 = createGame(loadRoomsFs(), { room: 'lab-1', x: 10, bottom: 22 });
    m1.mission.result = 'won';
    run(m1, Math.round(MISSION.outroTime / DT) + 30);
    expect(shot(m1).pushes.filter(p => p.y > 21)).toEqual([]); // под рамкой итогов миссии 1 пусто
  });

  it('звук record — как в миссии 1: один раз, когда показывается итог, если место 1', () => {
    const g = won2();
    g.board = { records: [row(552)], place: 1 };
    const sfx: string[] = [];
    for (let i = 0; i < Math.round(MISSION.outroTime / DT) + 60; i++) {
      stepGame(g, IDLE, DT);
      sfx.push(...g.sfx);
      g.sfx.length = 0;
    }
    expect(sfx.filter(s => s === 'record')).toHaveLength(1);
  });
});

describe('рекорды по миссиям', () => {
  it('миссия 2 — своя таблица diversantka.records.2; таблица миссии 1 не трогается; без номера — миссия 1', () => {
    expect(recordsKey(1)).toBe(SAVE.records);
    expect(recordsKey(2)).toBe('diversantka.records.2');
    const s = store();
    expect(saveRecord(s, row(600))).toBe(1);
    expect(saveRecord(s, row(552), 2)).toBe(1);
    expect(saveRecord(s, row(700), 2)).toBe(2);
    expect([...s.data.keys()].sort()).toEqual(['diversantka.records', 'diversantka.records.2']);
    expect(loadRecords(s).map(r => r.seconds)).toEqual([600]);
    expect(loadRecords(s, 2).map(r => r.seconds)).toEqual([552, 700]);
    expect(loadRecords(s, 1)).toEqual(loadRecords(s));
  });
});
