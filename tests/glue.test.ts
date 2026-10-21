import { describe, expect, it } from 'vitest';
import { DT, MISSION, NINA, PROLOGUE } from '../src/config';
import { enterRoom, startMission, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { MISSIONS } from '../src/missions';
import { drawGame } from '../src/render/scene';
import { loadDone, SAVE, saveWin } from '../src/save';
import { missionResult, plantBomb } from '../src/sim/mission';
import { createNina } from '../src/sim/nina';
import { decodeIntent, encodeIntent, packRecord, replayStep, replayUrl, shareText, unpackRecord, unpackReplay } from '../src/sim/record';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const JUMP = I({ jump: true, jumpPressed: true });
const run = (g: Game, it: Intent, n: number) => { for (let i = 0; i < n; i++) stepGame(g, it, DT); };
const store = () => {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
};
const texts = (g: Game) => {
  const out: string[] = [];
  drawGame({ push: () => {}, text: (_x: number, _y: number, s: string) => { out.push(s); } } as never, g, 1);
  return out;
};
// Встать у мотоцикла комнаты и нажать E.
const ride = (g: Game) => {
  g.nina = createNina(g.bike!.x - NINA.w / 2, g.bike!.bottom);
  run(g, IDLE, 10);
  stepGame(g, I({ usePressed: true }), DT);
};
const toBytes = (s: string) => Buffer.from(s, 'base64url');
const fromBytes = (b: Uint8Array) => Buffer.from(b).toString('base64url');

describe('сквозной путь: победа 1 → Пробел → миссия 2 → победа → итоги 2 → стартовый экран', () => {
  it('переходы, таблицы и флаги по миссиям', () => {
    const s = store();
    const g = startMission(1);
    g.prologue = null; // пролог пройден; дальше — сразу к мотоциклу в гараже
    enterRoom(g, 'garage-1');
    g.mission.fenceOff = true;
    ride(g);
    expect(g.mission.result).toBe('won');
    g.board = saveWin(s, g.missionId, missionResult(g.mission));
    expect(loadDone(s)).toBe(true);
    run(g, IDLE, Math.round((MISSION.outroTime + MISSION.restartDelay) / DT) + 2);
    stepGame(g, JUMP, DT);
    // миссия 2: сцена приезда, затем мир
    expect(g.missionId).toBe(2);
    expect(g.arrival).toBe(0);
    expect(g.rec).toEqual([]);
    run(g, IDLE, Math.round(MISSION.arriveTime / DT));
    expect(g.arrival).toBeNull();
    expect(g.mission.timeLeft).toBe(MISSIONS[2].time);
    ride(g); // у мотоцикла без бомбы — не едет
    expect(g.mission.result).toBeNull();
    expect(g.endT).toBe(0);
    run(g, IDLE, 60);
    plantBomb(g.mission);
    ride(g);
    expect(g.mission.result).toBe('won');
    const r = missionResult(g.mission);
    expect(r.line.startsWith('Диверсантка · бункер · ')).toBe(true);
    g.board = saveWin(s, g.missionId, r);
    expect(g.board.place).toBe(1);
    expect([...s.data.keys()].sort()).toEqual([SAVE.done, SAVE.level, SAVE.records, 'diversantka.records.2']);
    expect(s.getItem(SAVE.level)).toBe('3');
    run(g, IDLE, Math.round(MISSION.outroTime / DT) + 1);
    expect(texts(g)).toEqual(expect.arrayContaining(['МИССИЯ ВЫПОЛНЕНА', 'НОВЫЙ РЕКОРД']));
    run(g, IDLE, Math.round(MISSION.restartDelay / DT) + 1);
    g.unlocked = 2;
    stepGame(g, JUMP, DT);
    expect(g.missionId).toBe(3);
    expect(g.arrival).toBe(0);
    expect(g.unlocked).toBe(2); // открытая миссия переживает переход
  });

  it('saveWin миссии 2 не пишет «пройдено» и секрет', () => {
    const s = store();
    saveWin(s, 2, { time: '01:00', tapes: null, hits: 0, secret: true, line: '', seconds: 60, attacks: 0, date: '2026-10-14' });
    expect([...s.data.keys()].sort()).toEqual([SAVE.level, 'diversantka.records.2']);
    expect(loadDone(s)).toBe(false);
  });

  it('loadDone: «1» — открыта; нет записи, нет хранилища или оно бросает — закрыта', () => {
    const s = store();
    expect(loadDone(s)).toBe(false);
    s.setItem(SAVE.done, '1');
    expect(loadDone(s)).toBe(true);
    expect(loadDone(undefined)).toBe(false);
    expect(loadDone({ getItem: () => { throw new Error('SecurityError'); } })).toBe(false);
  });
});

describe('запись версий 2 и 3', () => {
  const rec = [encodeIntent(I({ moveX: 1 })), encodeIntent(I({ moveX: 1 })), encodeIntent(JUMP), 7];

  it('версия 3: байт версии, байт миссии; туда и обратно для обеих миссий; unpackRecord — только шаги', async () => {
    for (const mission of [1, 2] as const) {
      const p = await packRecord(rec, mission);
      expect([...toBytes(p).subarray(0, 2)]).toEqual([3, mission]);
      expect(await unpackReplay(p)).toEqual({ rec, mission });
      expect(await unpackRecord(p)).toEqual(rec);
    }
    expect([...toBytes(await packRecord(rec)).subarray(0, 2)]).toEqual([3, 1]); // без номера — миссия 1
    expect(await unpackReplay(await packRecord([], 2))).toEqual({ rec: [], mission: 2 });
  });

  it('ссылка версии 1 (до 5в.3) — миссия 1 с теми же шагами', async () => {
    const v2 = toBytes(await packRecord(rec, 1));
    const v1 = fromBytes(new Uint8Array([1, ...v2.subarray(2)]));
    expect(await unpackReplay(v1)).toEqual({ rec, mission: 1 });
  });

  it('миссия не 1 и не 2, чужая версия — ошибка', async () => {
    const v2 = toBytes(await packRecord(rec, 2));
    for (const m of [0, 3, 255]) await expect(unpackReplay(fromBytes(new Uint8Array([2, m, ...v2.subarray(2)])))).rejects.toThrow('unknown mission');
    await expect(unpackReplay(fromBytes(new Uint8Array([4, 2, ...v2.subarray(2)])))).rejects.toThrow('unknown version');
  });

  it('строка и ссылка для миссии 2: «бункер» в строке, миссия 2 в записи по ссылке', async () => {
    const g = startMission(2);
    run(g, IDLE, Math.round(MISSION.arriveTime / DT));
    g.mission.result = 'won';
    const url = replayUrl('https://art-ps.github.io/diversantka/?r=old#x', await packRecord(g.rec, 2));
    const text = shareText(missionResult(g.mission).line, url);
    const [line, link] = text.split('\n');
    expect(line.startsWith('Диверсантка · бункер · ')).toBe(true);
    expect(link.startsWith('https://art-ps.github.io/diversantka/?r=')).toBe(true);
    expect(await unpackReplay(new URL(link).searchParams.get('r')!)).toEqual({ rec: g.rec, mission: 2 });
  });
});

describe('реплей с миссией', () => {
  it('startMission: 1 — пролог (стартовый экран или сразу полёт), 2 — сцена приезда; миссия 2 открыта без diversantka.done', () => {
    expect(startMission(1, true).prologue!.phase).toBe('title');
    expect(startMission(1).prologue).toEqual({ d: PROLOGUE.startD, phase: 'fly', t: 0 });
    const g = startMission(2);
    expect(g.unlocked).toBe(1);
    expect(g.missionId).toBe(2);
    expect(g.arrival).toBe(0);
  });

  it('запись миссии 2 со сценой приезда воспроизводится по шагам: нажатия в сцене не сдвигают реплей', async () => {
    const a = startMission(2);
    const trace: string[] = [];
    for (let i = 0; i < Math.round(MISSION.arriveTime / DT) + 120; i++) {
      stepGame(a, I({ moveX: i % 40 < 20 ? 1 : -1, jump: i % 50 === 0, jumpPressed: i % 50 === 0, usePressed: i % 70 === 0, pausePressed: i === 30 }), DT);
      trace.push(`${a.roomId} ${a.nina.body.x} ${a.nina.body.y} ${a.arrival}`);
    }
    const r = { ...(await unpackReplay(await packRecord(a.rec, a.missionId))), i: 0 };
    const b = startMission(r.mission);
    for (let i = 0; i < trace.length; i++) {
      stepGame(b, replayStep(r, b.mission.result !== null)!, DT);
      expect(`${b.roomId} ${b.nina.body.x} ${b.nina.body.y} ${b.arrival}`, `шаг ${i}`).toBe(trace[i]);
    }
    expect(b.rec).toEqual(a.rec);
    expect(b.rec.map(decodeIntent).every(it => !it.pausePressed)).toBe(true);
  });
});
