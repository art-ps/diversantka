import { afterEach, describe, expect, it } from 'vitest';
import { DT, MISSION } from '../src/config';
import { createArrival, goalLine, startMission, stepGame, type Game } from '../src/game';
import { ruPlural, setLang, STR } from '../src/i18n';
import { IDLE, type Intent } from '../src/input/intent';
import { missionDef, worldOf } from '../src/levels';
import { drawGame } from '../src/render/scene';
import { enterTapes, plantBomb, startBike, useSwitch } from '../src/sim/mission';
import { parsePoints } from '../src/world/spawns';

afterEach(() => setLang('ru'));

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const JUMP = I({ jump: true, jumpPressed: true });
const run = (g: Game, it: Intent, n: number) => { for (let i = 0; i < n; i++) stepGame(g, it, DT); };
const afterArrival = (g: Game) => run(g, IDLE, Math.round(MISSION.arriveTime / DT));
const endAndJump = (g: Game, shown: number) => {
  run(g, IDLE, Math.round((shown + MISSION.restartDelay) / DT) + 2);
  stepGame(g, JUMP, DT);
};
const texts = (g: Game) => {
  const out: string[] = [];
  drawGame({ push: () => {}, text: (_x: number, _y: number, s: string) => { out.push(s); } } as never, g, 0.1);
  return out;
};
// Все ленты уровня — подобраны (id как в enterRoom).
const takeAllTapes = (g: Game) => {
  for (const r of g.rooms.values()) parsePoints(r.meta.tapes, r.id, 'ленты').forEach((_, i) => g.mission.tapes.add(`${r.id}#t${i}`));
};

describe('сгенерированные уровни в игре', () => {
  it('startMission(3) — сцена приезда на старте уровня 3, таймер и цель из описания', () => {
    const g = startMission(3), d = missionDef(3);
    expect(g.missionId).toBe(3);
    expect(g.arrival).toBe(0);
    expect(g.roomId).toBe(d.start.room);
    expect(g.start).toEqual(d.start);
    expect(g.mission.timeLeft).toBe(d.time);
    expect(g.mission.goal).toBe('bomb');
  });

  it('уровень 3 (bomb): закладка и выезд — победа; прыжок — уровень 4 со сцены приезда', () => {
    const g = startMission(3);
    afterArrival(g);
    expect(goalLine(g)).toBe(STR.ru.goalPlant);
    plantBomb(g.mission);
    expect(goalLine(g)).toBe(STR.ru.goalEscape);
    expect(startBike(g.mission)).toBe(true);
    endAndJump(g, MISSION.outroTime);
    expect(g.missionId).toBe(4);
    expect(g.arrival).toBe(0);
    expect(g.roomId).toBe(missionDef(4).start.room);
  });

  it('уровень 4 (ленты): шаги задания по порядку, ЭВМ берёт ровно tapesNeed, щиток, выезд — победа', () => {
    const g = startMission(4), need = missionDef(4).tapes;
    afterArrival(g);
    expect(g.mission.tapesNeed).toBe(need);
    expect(goalLine(g)).toBe(STR.ru.goalTapes(need));
    takeAllTapes(g);
    expect(g.mission.tapes.size).toBe(need);
    expect(texts(g).join('|')).toContain(STR.ru.hudTapes(need, need).trim().replace(/ ·$/, ''));
    expect(goalLine(g)).toBe(STR.ru.goalComputer);
    enterTapes(g.mission);
    expect(goalLine(g)).toBe(STR.ru.goalSwitch);
    useSwitch(g.mission);
    expect(goalLine(g)).toBe(STR.ru.goalEscape);
    expect(startBike(g.mission)).toBe(true);
  });

  it('провал на N ≥ 3 — снова N со сцены приезда', () => {
    const g = startMission(5);
    afterArrival(g);
    g.mission.result = 'failed';
    endAndJump(g, 0);
    expect(g.missionId).toBe(5);
    expect(g.arrival).toBe(0);
  });

  it('сцена приезда: название и первый шаг задания; миссия 2 — прежние строки', () => {
    const g = startMission(4);
    run(g, IDLE, 5);
    const t = texts(g);
    expect(t).toContain(STR.ru.missionName(4, 'tapes'));
    expect(t).toContain(STR.ru.goalTapes(missionDef(4).tapes));
    const b = createArrival(worldOf(2));
    run(b, IDLE, 5);
    expect(texts(b)).toEqual(expect.arrayContaining([STR.ru.missionName(2, 'bomb'), STR.ru.goalBomb]));
  });

  it('ленты сгенерированного уровня: после сцены приезда — «ЗАБОР ПОД ТОКОМ» над забором', () => {
    const g = startMission(4);
    afterArrival(g);
    stepGame(g, IDLE, DT);
    expect(g.floaters.map(f => f.text)).toContain(STR.ru.fenceLive);
  });

  it('названия и числительные', () => {
    expect(STR.ru.missionName(1, 'tapes')).toBe('МИССИЯ 1 · БАЗА');
    expect(STR.ru.missionName(2, 'bomb')).toBe('МИССИЯ 2 · БУНКЕР');
    expect(STR.ru.missionName(7, 'bomb')).toBe('МИССИЯ 7 · ПОДРЫВ');
    expect(STR.ru.missionName(8, 'tapes')).toBe('МИССИЯ 8 · ЛЕНТЫ');
    expect(STR.en.missionName(7, 'bomb')).toBe('MISSION 7 · DEMOLITION');
    expect(STR.en.missionName(8, 'tapes')).toBe('MISSION 8 · TAPES');
    expect(STR.ru.goalTapes(4)).toBe('СОБЕРИ 4 ЛЕНТЫ');
    expect(STR.ru.goalTapes(5)).toBe('СОБЕРИ 5 ЛЕНТ');
    expect(STR.en.goalTapes(5)).toBe('COLLECT 5 TAPES');
    expect(STR.ru.goalPlant).toBe('ЗАЛОЖИ БОМБУ');
    expect(STR.en.goalPlant).toBe('PLANT THE BOMB');
    expect([1, 2, 5, 11, 21, 22, 25].map(n => ruPlural(n, 'МИНУТА', 'МИНУТЫ', 'МИНУТ'))).toEqual(['МИНУТА', 'МИНУТЫ', 'МИНУТ', 'МИНУТ', 'МИНУТА', 'МИНУТЫ', 'МИНУТ']);
  });
});
