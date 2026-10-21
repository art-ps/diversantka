import { afterEach, describe, expect, it } from 'vitest';
import { BOMB, DT, MISSION, PROLOGUE } from '../src/config';
import { createArrival, createGame, createPrologue, stepGame, type Game } from '../src/game';
import { lang, setLang, STR } from '../src/i18n';
import { IDLE, type Intent } from '../src/input/intent';
import { MISSIONS } from '../src/missions';
import { CHARSET } from '../src/render/atlas';
import { PAL } from '../src/render/palette';
import { drawGame } from '../src/render/scene';
import { LOCKED, TITLE_BOX } from '../src/render/screens';
import { plantBomb } from '../src/sim/mission';
import { loadRoomsFs } from './helpers';

afterEach(() => setLang('ru'));

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const JUMP = I({ jump: true, jumpPressed: true });
const UP = I({ up: true, upPressed: true }), DOWN = I({ down: true, downPressed: true });
const LEFT = I({ moveX: -1 }), RIGHT = I({ moveX: 1 });
const run = (g: Game, it: Intent, n: number) => { for (let i = 0; i < n; i++) stepGame(g, it, DT); };
const title = (unlocked: boolean) => {
  const g = createPrologue(loadRoomsFs(), true);
  g.unlocked = unlocked;
  return g;
};
type T = { x: number; y: number; s: string; c: unknown; step: number };
const texts = (g: Game): T[] => {
  const out: T[] = [];
  drawGame({ push: () => {}, text: (x: number, y: number, s: string, c: unknown, step = 1) => { out.push({ x, y, s, c, step }); } } as never, g, 0.1);
  return out;
};
const missionRow = (g: Game) => texts(g).filter(t => t.y === TITLE_BOX.y0 + 2);
const part = (g: Game, s: string) => missionRow(g).find(t => t.s === s)!;
// После итога прыжок слушается через restartDelay.
const endAndJump = (g: Game, shown: number) => {
  run(g, IDLE, Math.round((shown + MISSION.restartDelay) / DT) + 2);
  stepGame(g, JUMP, DT);
};

describe('стартовый экран: строка миссии', () => {
  it('«МИССИЯ  1 · 2» под строкой языка, по центру рамки; выбрана 1; 2 тусклая, пока миссия 1 не пройдена', () => {
    for (const l of ['ru', 'en'] as const) {
      setLang(l);
      const g = title(false);
      const row = missionRow(g);
      expect(row.map(t => t.s).join('')).toBe(`${STR[l].titleMission}  1 · 2`);
      const left = row[0].x, last = row.at(-1)!, right = last.x + last.s.length * last.step;
      expect((left + right) / 2).toBeCloseTo((TITLE_BOX.x0 + TITLE_BOX.x1 + 1) / 2);
      expect(left).toBeGreaterThan(TITLE_BOX.x0 + 1);
      expect(right).toBeLessThan(TITLE_BOX.x1);
      expect(part(g, '1').c).toBe(PAL.item);
      expect(part(g, '2').c).toBe(LOCKED);
      for (const t of row) for (const ch of t.s) expect(CHARSET).toContain(ch);
    }
    expect(part(title(true), '2').c).toBe(PAL.hudDim);
  });

  it('вверх/вниз двигают фокус: строка в фокусе — ярко, другая — тускло', () => {
    const g = title(true);
    const frame = (y: number, s: string) => texts(g).find(t => t.y === y && t.s === s)!.c;
    expect(frame(TITLE_BOX.y0 + 1, '< ')).toBe(PAL.hud);
    expect(frame(TITLE_BOX.y0 + 2, `${STR.ru.titleMission}  `)).toBe(PAL.hudDim);
    stepGame(g, DOWN, DT);
    expect(g.menu.row).toBe('mission');
    expect(frame(TITLE_BOX.y0 + 1, '< ')).toBe(PAL.hudDim);
    expect(frame(TITLE_BOX.y0 + 2, `${STR.ru.titleMission}  `)).toBe(PAL.hud);
    stepGame(g, UP, DT);
    expect(g.menu.row).toBe('lang');
  });

  it('на строке миссии влево/вправо выбирают миссию, язык не трогают; на строке языка — язык, миссию не трогают', () => {
    const g = title(true);
    stepGame(g, DOWN, DT);
    run(g, RIGHT, 30);
    expect(g.menu.sel).toBe(2);
    expect(lang()).toBe('ru');
    expect(part(g, '2').c).toBe(PAL.item);
    expect(texts(g).map(t => t.s)).toContain(STR.ru.titleTask2);
    expect(texts(g).map(t => t.s)).not.toContain(STR.ru.titleTask);
    stepGame(g, LEFT, DT);
    expect(g.menu.sel).toBe(1);
    expect(lang()).toBe('ru');
    stepGame(g, RIGHT, DT);
    stepGame(g, UP, DT);
    stepGame(g, LEFT, DT);
    expect(lang()).toBe('en');
    expect(g.menu.sel).toBe(2);
    expect(g.prologue!.phase).toBe('title');
  });

  it('миссия 2 закрыта: вправо на строке миссии ничего не выбирает, пробел — миссия 1, полёт пролога', () => {
    const g = title(false);
    stepGame(g, DOWN, DT);
    run(g, RIGHT, 30);
    expect(g.menu.sel).toBe(1);
    stepGame(g, JUMP, DT);
    expect(g.missionId).toBe(1);
    expect(g.prologue).toEqual({ d: PROLOGUE.startD, phase: 'fly', t: 0 });
  });

  it('миссия 2 выбрана — пробел начинает её со сцены приезда; запись пустая, нажатие старта в неё не попало', () => {
    const g = title(true);
    stepGame(g, DOWN, DT);
    stepGame(g, RIGHT, DT);
    stepGame(g, JUMP, DT);
    expect(g.missionId).toBe(2);
    expect(g.arrival).toBe(0);
    expect(g.prologue).toBeNull();
    expect(g.roomId).toBe(MISSIONS[2].start.room);
    expect(g.mission.timeLeft).toBe(MISSIONS[2].time);
    expect(g.rec).toEqual([]);
  });
});

describe('переходы между миссиями', () => {
  it('победа в 1 → итоги → прыжок → миссия 2 со сцены приезда', () => {
    const g = createPrologue(loadRoomsFs());
    g.prologue = null; // миссия 1 идёт; пролог пройден
    g.mission.result = 'won';
    endAndJump(g, MISSION.outroTime);
    expect(g.missionId).toBe(2);
    expect(g.arrival).toBe(0);
    expect(g.roomId).toBe('gate');
    expect(g.mission.goal).toBe('bomb');
  });

  it('победа в 2 → итоги 2 → прыжок → миссия 3 со сцены приезда', () => {
    const g = createArrival(loadRoomsFs('rooms2'));
    run(g, IDLE, Math.round(MISSION.arriveTime / DT));
    g.mission.result = 'won';
    endAndJump(g, MISSION.outroTime);
    expect(g.missionId).toBe(3);
    expect(g.arrival).toBe(0);
    expect(g.prologue).toBeNull();
  });

  it('провал миссии 1 → стартовый экран, выбрана миссия 1', () => {
    const g = createPrologue(loadRoomsFs());
    g.prologue = null;
    g.mission.result = 'failed';
    endAndJump(g, 0);
    expect(g.missionId).toBe(1);
    expect(g.prologue!.phase).toBe('title');
    expect(g.menu).toEqual({ row: 'lang', sel: 1 });
  });

  it('взрыв в миссии 2 → «заново» — миссия 2 со сцены приезда, не стартовый экран и не миссия 1', () => {
    const g = createArrival(loadRoomsFs('rooms2'));
    run(g, IDLE, Math.round(MISSION.arriveTime / DT));
    plantBomb(g.mission);
    g.mission.fuse = DT / 2;
    stepGame(g, IDLE, DT);
    expect(g.mission.blown).toBe(true);
    endAndJump(g, BOMB.blast);
    expect(g.missionId).toBe(2);
    expect(g.arrival).toBe(0);
    expect(g.prologue).toBeNull();
    expect(g.mission.fuse).toBeNull();
    expect(g.mission.timeLeft).toBe(MISSIONS[2].time);
  });

  it('итог победы: подсказка «ПРЫЖОК — ДАЛЬШЕ»; провал — по-прежнему «ЗАНОВО»', () => {
    const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 10, bottom: 22 });
    g.mission.result = 'won';
    run(g, IDLE, Math.round(MISSION.outroTime / DT) + 1);
    expect(texts(g).map(t => t.s)).toContain('E/Y — СКОПИРОВАТЬ · ПРЫЖОК — ДАЛЬШЕ');
    expect(STR.en.copyHint).toBe('E/Y — COPY · JUMP — NEXT');
    expect(STR.ru.failedHint).toBe('ПРЫЖОК — ЗАНОВО');
  });
});
