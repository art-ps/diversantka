import { afterEach, describe, expect, it } from 'vitest';
import { DT, TITLE } from '../src/config';
import { createPrologue, stepGame, type Game } from '../src/game';
import { setLang, STR } from '../src/i18n';
import { IDLE, type Intent } from '../src/input/intent';
import { missionDef } from '../src/levels';
import { PAL } from '../src/render/palette';
import { drawGame } from '../src/render/scene';
import { TITLE_BOX } from '../src/render/screens';
import { loadLevel, SAVE, saveLevel, saveWin } from '../src/save';
import { createMission, missionResult } from '../src/sim/mission';
import { loadRoomsFs } from './helpers';

afterEach(() => setLang('ru'));

const store = (init: Record<string, string> = {}) => {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const DOWN = I({ down: true, downPressed: true }), JUMP = I({ jump: true, jumpPressed: true });
const LEFT = I({ moveX: -1 }), RIGHT = I({ moveX: 1 });
const run = (g: Game, it: Intent, n: number) => { for (let i = 0; i < n; i++) stepGame(g, it, DT); };
const title = (unlocked: number) => {
  const g = createPrologue(loadRoomsFs(), true);
  g.unlocked = unlocked;
  stepGame(g, DOWN, DT); // фокус на строке миссии
  return g;
};
type T = { y: number; s: string; c: unknown };
const texts = (g: Game): T[] => {
  const out: T[] = [];
  drawGame({ push: () => {}, text: (_x: number, y: number, s: string, c: unknown) => { out.push({ y, s, c }); } } as never, g, 0.1);
  return out;
};
const row = (g: Game, dy: number) => texts(g).filter(t => t.y === TITLE_BOX.y0 + dy).map(t => t.s).join('');

describe('открытый уровень в хранилище', () => {
  it('нет ключа — по старому флагу: пройдена миссия 1 → 2, иначе 1; мусор — как нет; хранилище бросает — 1', () => {
    expect(loadLevel(store())).toBe(1);
    expect(loadLevel(store({ [SAVE.done]: '1' }))).toBe(2);
    expect(loadLevel(store({ [SAVE.level]: '7' }))).toBe(7);
    expect(loadLevel(store({ [SAVE.level]: 'abc', [SAVE.done]: '1' }))).toBe(2);
    expect(loadLevel(store({ [SAVE.level]: '0' }))).toBe(1);
    expect(loadLevel(store({ [SAVE.level]: '3.5' }))).toBe(1);
    expect(loadLevel(undefined)).toBe(1);
    expect(loadLevel({ getItem: () => { throw new Error('denied'); } })).toBe(1);
  });

  it('saveLevel только поднимает; победа на N открывает N + 1, рекорд — в таблицу N', () => {
    const s = store({ [SAVE.level]: '5' });
    saveLevel(s, 3);
    expect(loadLevel(s)).toBe(5);
    saveLevel(s, 8);
    expect(loadLevel(s)).toBe(8);
    const m = createMission({ room: 'a', x: 0, bottom: 22 }, 'bomb', 600, 0);
    saveWin(s, 9, missionResult(m, new Date(2026, 9, 21), 9));
    expect(loadLevel(s)).toBe(10);
    expect(s.data.has('diversantka.records.9')).toBe(true);
    expect(() => saveLevel({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, 4)).not.toThrow();
  });
});

describe('стартовый экран: лестница уровней', () => {
  it('открыто ≤ 2 — прежняя строка «МИССИЯ  1 · 2»; открыто 7 — «МИССИЯ  < 1 >» и название под ней', () => {
    expect(row(title(2), 2)).toBe(`${STR.ru.titleMission}  1 · 2`);
    const g = title(7);
    expect(row(g, 2)).toBe(`${STR.ru.titleMission}  < 1 >`);
    expect(row(g, 3)).toBe(STR.ru.missionName(1, 'tapes'));
  });

  it('нажатие — шаг на 1; не выше открытого и не ниже 1; задача — по выбранной миссии', () => {
    const g = title(4);
    stepGame(g, RIGHT, DT);
    expect(g.menu.sel).toBe(2);
    stepGame(g, IDLE, DT);
    stepGame(g, RIGHT, DT);
    expect(g.menu.sel).toBe(3);
    const d = missionDef(3);
    expect(texts(g).map(t => t.s)).toContain(STR.ru.titleTaskGen(d.goal, d.tapes, Math.ceil(d.time / 60)));
    expect(row(g, 3)).toBe(STR.ru.missionName(3, d.goal));
    for (let i = 0; i < 5; i++) { stepGame(g, IDLE, DT); stepGame(g, RIGHT, DT); }
    expect(g.menu.sel).toBe(4);
    for (let i = 0; i < 9; i++) { stepGame(g, IDLE, DT); stepGame(g, LEFT, DT); }
    expect(g.menu.sel).toBe(1);
  });

  it('удержание: шаг сразу, потом пауза repeatDelay, потом шаг каждые repeatEvery', () => {
    const g = title(50);
    run(g, RIGHT, 1);
    expect(g.menu.sel).toBe(2);
    run(g, RIGHT, Math.floor(TITLE.repeatDelay / DT) - 2);
    expect(g.menu.sel).toBe(2);
    run(g, RIGHT, 2 + Math.round((4 * TITLE.repeatEvery) / DT));
    expect(g.menu.sel).toBeGreaterThanOrEqual(6);
    expect(g.menu.sel).toBeLessThanOrEqual(8);
  });

  it('пробел на сгенерированном — его сцена приезда', () => {
    const g = title(4);
    run(g, RIGHT, 1); stepGame(g, IDLE, DT); run(g, RIGHT, 1);
    stepGame(g, JUMP, DT);
    expect(g.missionId).toBe(3);
    expect(g.arrival).toBe(0);
    expect(g.unlocked).toBe(4);
  });

  it('выбранное число — цветом предмета, стрелки — цветом рамки строки', () => {
    const g = title(7);
    const t = texts(g).filter(x => x.y === TITLE_BOX.y0 + 2);
    expect(t.find(x => x.s === '1')!.c).toBe(PAL.item);
    expect(t.find(x => x.s === '< ')!.c).toBe(PAL.hud);
  });

  it('titleTaskGen: RU с числительными, EN — MIN', () => {
    expect(STR.ru.titleTaskGen('bomb', 0, 9)).toBe('БОМБА · МОТОЦИКЛ. 9 МИНУТ');
    expect(STR.ru.titleTaskGen('tapes', 4, 22)).toBe('4 ЛЕНТЫ · ЭВМ · ЗАБОР · МОТОЦИКЛ. 22 МИНУТЫ');
    expect(STR.en.titleTaskGen('tapes', 5, 21)).toBe('5 TAPES · COMPUTER · FENCE · BIKE. 21 MIN');
  });
});
