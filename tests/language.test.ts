import { afterEach, expect, it } from 'vitest';
import { DT, MISSION, PROLOGUE } from '../src/config';
import { createGame, createPrologue, stepGame, type Game } from '../src/game';
import { lang, LANG_NAMES, setLang, STR } from '../src/i18n';
import { fromGamepad, IDLE, IntentTracker, type Intent, type PadSnapshot } from '../src/input/intent';
import { PAL } from '../src/render/palette';
import { drawGame } from '../src/render/scene';
import { TITLE_BOX } from '../src/render/screens';
import { loadLang, SAVE, saveLang } from '../src/save';
import { loadRoomsFs } from './helpers';

afterEach(() => setLang('ru')); // язык — общий для модуля: вернуть русский для следующих тестов

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const LEFT = I({ moveX: -1 }), RIGHT = I({ moveX: 1 });
const JUMP = I({ jump: true, jumpPressed: true });
const run = (g: Game, it: Intent, n: number) => { for (let i = 0; i < n; i++) stepGame(g, it, DT); };
const title = () => createPrologue(loadRoomsFs(), true);
const pad = (pressed: number[], axes = [0, 0]): PadSnapshot => ({ axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })) });

type T = { x: number; y: number; s: string; c: unknown; step: number };
const texts = (g: Game): T[] => {
  const out: T[] = [];
  drawGame({ push: () => {}, text: (x: number, y: number, s: string, c: unknown, step = 1) => { out.push({ x, y, s, c, step }); } } as never, g, 0.1);
  return out;
};

it('строка «< ENGLISH · РУССКИЙ >» — вверху рамки, по центру; выбранный язык ярче, остальное тускло', () => {
  for (const l of ['en', 'ru'] as const) {
    setLang(l);
    const row = texts(title()).filter(t => t.y === TITLE_BOX.y0 + 1);
    expect(row.map(t => t.s).join('')).toBe('< ENGLISH · РУССКИЙ >');
    const word = (s: string) => row.find(t => t.s === s)!;
    expect(word(LANG_NAMES[l]).c).toBe(PAL.item);
    expect(word(LANG_NAMES[l === 'en' ? 'ru' : 'en']).c).toBe(PAL.hudDim);
    const left = row[0].x, right = row.at(-1)!.x + row.at(-1)!.s.length * row.at(-1)!.step;
    expect((left + right) / 2).toBeCloseTo((TITLE_BOX.x0 + TITLE_BOX.x1 + 1) / 2);
  }
});

it('влево — English, вправо — русский; весь экран меняется сразу; удержание не листает; ничего больше не двигается', () => {
  const g = title();
  const body = { ...g.nina.body }, prologue = { ...g.prologue! };
  stepGame(g, LEFT, DT);
  expect(lang()).toBe('en');
  expect(texts(g).map(t => t.s)).toEqual(expect.arrayContaining([STR.en.titleName, STR.en.titleTask, STR.en.titleFocus, 'ENERGY ']));
  run(g, LEFT, 120);
  expect(lang()).toBe('en');
  stepGame(g, RIGHT, DT);
  expect(lang()).toBe('ru');
  expect(texts(g).map(t => t.s)).toEqual(expect.arrayContaining([STR.ru.titleName, STR.ru.titleTask, 'ЭНЕРГИЯ ']));
  run(g, RIGHT, 120);
  expect(lang()).toBe('ru');
  run(g, I({ up: true, upPressed: true }), 5);
  run(g, I({ down: true, downPressed: true }), 5);
  expect(lang()).toBe('ru');
  expect(g.nina.body).toEqual(body);
  expect(g.prologue).toEqual(prologue);
  expect(g.mission.timeLeft).toBe(MISSION.time);
  expect(g.sfx).toEqual([]);
});

it('геймпад: крестовина и стик влево/вправо выбирают язык; A после выбора — старт полёта на этом языке', () => {
  const g = title();
  const tr = new IntentTracker();
  stepGame(g, tr.update(fromGamepad(pad([14]))), DT);
  expect(lang()).toBe('en');
  stepGame(g, tr.update(fromGamepad(pad([], [0.6, 0]))), DT);
  expect(lang()).toBe('ru');
  stepGame(g, tr.update(fromGamepad(pad([], [-0.1, 0]))), DT); // мёртвая зона стика — не выбор
  expect(lang()).toBe('ru');
  stepGame(g, tr.update(fromGamepad(pad([], [-0.6, 0]))), DT);
  stepGame(g, tr.update(fromGamepad(pad([0]))), DT);
  expect(g.prologue).toEqual({ d: PROLOGUE.startD, phase: 'fly', t: 0 });
  expect(lang()).toBe('en');
  expect(texts(g).map(t => t.s)).toContain(STR.en.prologue.fly);
});

it('язык меняется только на стартовом экране: в полёте, в игре и на паузе влево/вправо язык не трогают; «заново» его сохраняет', () => {
  setLang('en');
  const g = title();
  stepGame(g, JUMP, DT);
  run(g, RIGHT, 30);
  expect(g.prologue!.phase).toBe('fly');
  expect(lang()).toBe('en');
  const m = createGame(loadRoomsFs(), { room: 'evm-1', x: 4, bottom: 22 });
  run(m, RIGHT, 30);
  run(m, LEFT, 30);
  stepGame(m, I({ pausePressed: true }), DT);
  run(m, RIGHT, 30);
  expect(m.paused).toBe(true);
  expect(lang()).toBe('en');
  m.mission.result = 'failed';
  run(m, IDLE, Math.round(MISSION.restartDelay / DT) + 2);
  stepGame(m, JUMP, DT);
  expect(m.mission.result).toBeNull();
  expect(lang()).toBe('en');
});

it('выбор помнится в localStorage; первый запуск — по языку браузера: ru* — русский, иначе English', () => {
  const data = new Map<string, string>();
  const s = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  expect(loadLang(s, 'ru-RU')).toBe('ru');
  expect(loadLang(s, 'RU')).toBe('ru');
  expect(loadLang(s, 'en-US')).toBe('en');
  expect(loadLang(s, 'uk-UA')).toBe('en');
  expect(loadLang(s, undefined)).toBe('en');
  saveLang(s, 'en');
  expect(data.get(SAVE.lang)).toBe('en');
  expect(loadLang(s, 'ru-RU')).toBe('en');
  saveLang(s, 'ru');
  expect(loadLang(s, 'en-US')).toBe('ru');
  data.set(SAVE.lang, 'fr');
  expect(loadLang(s, 'en-GB')).toBe('en');
});

it('хранилища нет или оно бросает — язык браузера, игра идёт', () => {
  const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('quota'); } };
  expect(loadLang(broken, 'ru')).toBe('ru');
  expect(loadLang(broken, 'de-DE')).toBe('en');
  expect(() => saveLang(broken, 'en')).not.toThrow();
  expect(loadLang(undefined, 'ru-BY')).toBe('ru');
  expect(() => saveLang(undefined, 'ru')).not.toThrow();
});
