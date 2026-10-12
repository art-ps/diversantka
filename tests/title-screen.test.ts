import { expect, it } from 'vitest';
import { DT, PROLOGUE, TITLE } from '../src/config';
import { createPrologue, stepGame, type Game } from '../src/game';
import { IDLE } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { drawGame } from '../src/render/scene';
import { TITLE_BOX, TITLE_FOCUS, TITLE_KEYS, TITLE_NAME, TITLE_START, TITLE_TASK } from '../src/render/screens';
import { gliderAt, gliderRect } from '../src/sim/glider';
import { loadRoomsFs } from './helpers';

type P = { x: number; y: number; ch: string };
type T = { x: number; y: number; s: string; step: number };
const shot = (g: Game, time: number) => {
  const pushes: P[] = [], texts: T[] = [];
  drawGame({ push: (x: number, y: number, ch: string) => { pushes.push({ x, y, ch }); }, text: (x: number, y: number, s: string, _c: unknown, step = 1) => { texts.push({ x, y, s, step }); } } as never, g, time);
  return { pushes, texts, strings: texts.map(t => t.s) };
};
const title = () => createPrologue(loadRoomsFs(), true);
const B = TITLE_BOX;
// центр символа строго внутри рамки (не на ней)
const inner = (cx: number, cy: number) => cx > B.x0 + 1 && cx < B.x1 && cy > B.y0 + 1 && cy < B.y1;
const ON = 0.1 / TITLE.blinkHz, OFF = 0.6 / TITLE.blinkHz; // фаза мигания: горит / погашена

it('стартовый экран: название, задача, таблица клавиш (клавиатура и геймпад), «ПРОБЕЛ — НАЧАТЬ», подсказка про фокус', () => {
  const s = shot(title(), ON);
  expect(TITLE_TASK).toBe('6 ЛЕНТ · ЭВМ · ЗАБОР · МОТОЦИКЛ. 15 МИНУТ');
  expect(TITLE_KEYS.map(r => r[0])).toEqual(['', 'ХОД', 'ПРЫЖОК', 'УДАР', 'БРОСОК', 'ТЕРМИНАЛ/ЛИФТ', 'ПАУЗА', 'ЗВУК']);
  for (const want of [TITLE_NAME, TITLE_TASK, TITLE_START, TITLE_FOCUS, ...TITLE_KEYS.flat().filter(Boolean)]) expect(s.strings).toContain(want);
  expect(TITLE_KEYS.find(r => r[0] === 'ПРЫЖОК')).toEqual(['ПРЫЖОК', 'ПРОБЕЛ', 'A']);
  expect(TITLE_KEYS.find(r => r[0] === 'ПАУЗА')).toEqual(['ПАУЗА', 'ESC', 'START']);
  for (const t of s.texts) for (const ch of t.s) expect(CHARSET, t.s).toContain(ch);
  for (const p of s.pushes) expect(CHARSET).toContain(p.ch);
});

it('«ПРОБЕЛ — НАЧАТЬ» мигает с частотой TITLE.blinkHz; остальное горит ровно', () => {
  const on = shot(title(), ON).strings, off = shot(title(), OFF).strings;
  expect(on).toContain(TITLE_START);
  expect(off).not.toContain(TITLE_START);
  expect(off).toContain(TITLE_NAME);
  expect(off).toContain(TITLE_FOCUS);
});

it('текст стартового экрана — внутри рамки; под рамкой не рисуются ни дождь, ни море, ни сетка фона; дельтаплан — снаружи и цел', () => {
  const g = title();
  for (const time of [0.3, 1, 2.5, 7.7]) {
    const s = shot(g, time);
    const own = s.texts.filter(t => [TITLE_NAME, TITLE_TASK, TITLE_START, TITLE_FOCUS, ...TITLE_KEYS.flat()].includes(t.s));
    for (const t of own) {
      [...t.s].forEach((_, i) => expect(inner(t.x + i * t.step + 0.5, t.y + 0.5), `${t.s} @${time}`).toBe(true));
    }
    expect(s.pushes.filter(p => inner(p.x + 0.5, p.y + 0.5))).toEqual([]);
    expect(s.pushes.filter(p => p.ch === '+')).toHaveLength(4); // углы рамки
    expect(s.pushes.some(p => !inner(p.x + 0.5, p.y + 0.5) && (p.ch === ',' || p.ch === '/'))).toBe(true); // шторм вокруг идёт
  }
  const r = gliderRect(gliderAt(PROLOGUE.startD));
  expect(r.x + r.w).toBeLessThan(B.x0); // рамка не закрывает дельтаплан
});

it('после старта рамки нет — обычный кадр полёта; шторм снова идёт по всему экрану', () => {
  const g = title();
  stepGame(g, { ...IDLE, jump: true, jumpPressed: true }, DT);
  const s = shot(g, ON);
  for (const t of [TITLE_NAME, TITLE_TASK, TITLE_START, TITLE_FOCUS]) expect(s.strings).not.toContain(t);
  expect(s.pushes.filter(p => inner(p.x + 0.5, p.y + 0.5)).length).toBeGreaterThan(0);
});
