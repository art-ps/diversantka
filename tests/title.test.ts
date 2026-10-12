import { expect, it } from 'vitest';
import { DT, MISSION, PROLOGUE } from '../src/config';
import { createPrologue, stepGame, type Game } from '../src/game';
import { fromGamepad, IDLE, IntentTracker, type Intent, type PadSnapshot } from '../src/input/intent';
import { CLIPS } from '../src/anim/clips';
import { gliderGlyphs, hangPose } from '../src/render/glider';
import { drawGame } from '../src/render/scene';
import { gliderAt } from '../src/sim/glider';
import { loadRoomsFs } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const JUMP = I({ jump: true, jumpPressed: true });
const run = (g: Game, it: Intent, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) stepGame(g, it, DT);
};
const title = () => createPrologue(loadRoomsFs(), true);
const pad = (pressed: number[]): PadSnapshot => ({ axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })) });

it('стартовый экран: дельтаплан стоит, таймер стоит, паузы нет; любые кнопки, кроме прыжка, ничего не делают', () => {
  const g = title();
  expect(g.roomId).toBe('sea-1');
  expect(g.prologue).toEqual({ d: PROLOGUE.startD, phase: 'title', t: 0 });
  const body = { ...g.nina.body };
  const others = [
    I({ moveX: 1 }), I({ moveX: -1 }), I({ up: true, upPressed: true }), I({ down: true, downPressed: true }),
    I({ attackPressed: true }), I({ throwPressed: true }), I({ usePressed: true }), I({ pausePressed: true }), I({ jump: true }),
  ];
  for (const it of others) run(g, it, 120);
  expect(g.prologue).toEqual({ d: PROLOGUE.startD, phase: 'title', t: 0 });
  expect(g.nina.body).toEqual(body);
  expect(g.paused).toBe(false);
  expect(g.transition).toBeNull();
  expect(g.mission.timeLeft).toBe(MISSION.time);
  expect(g.sfx).toEqual([]);
});

it('прыжок со стартового экрана — полёт с начала; это нажатие и удержание не отцепляют, прыжок после armTime — отцепляет', () => {
  const g = title();
  stepGame(g, JUMP, DT);
  expect(g.prologue).toEqual({ d: PROLOGUE.startD, phase: 'fly', t: 0 });
  run(g, I({ jump: true }), Math.round(PROLOGUE.armTime / DT) + 30);
  expect(g.prologue!.phase).toBe('fly');
  expect(g.prologue!.d).toBeGreaterThan(PROLOGUE.startD);
  expect(g.mission.timeLeft).toBe(MISSION.time);
  stepGame(g, JUMP, DT);
  expect(g.prologue!.phase).toBe('fall');
});

it('геймпад: A начинает полёт; Start — нет и паузу не ставит', () => {
  const g = title();
  const tr = new IntentTracker();
  stepGame(g, tr.update(fromGamepad(pad([9]))), DT);
  stepGame(g, tr.update(fromGamepad(pad([]))), DT);
  expect(g.prologue!.phase).toBe('title');
  expect(g.paused).toBe(false);
  stepGame(g, tr.update(fromGamepad(pad([0]))), DT);
  expect(g.prologue).toEqual({ d: PROLOGUE.startD, phase: 'fly', t: 0 });
});

it('после всплеска и удара о мачту — сразу полёт, без стартового экрана', () => {
  const crash = title();
  stepGame(crash, JUMP, DT);
  run(crash, IDLE, 3000, () => crash.prologue!.phase === 'crash');
  run(crash, IDLE, Math.round(PROLOGUE.retryDelay / DT) + 2, () => crash.prologue!.phase === 'fly');
  expect(crash.prologue).toEqual({ d: PROLOGUE.startD, phase: 'fly', t: 0 });
  const sea = title();
  stepGame(sea, JUMP, DT);
  run(sea, IDLE, 3000, () => sea.roomId === 'sea-2' && !sea.transition && gliderAt(sea.prologue!.d).x >= 20);
  stepGame(sea, JUMP, DT);
  run(sea, IDLE, 600, () => sea.prologue!.phase === 'splash');
  expect(sea.prologue!.phase).toBe('splash');
  run(sea, IDLE, Math.round(PROLOGUE.retryDelay / DT) + 2, () => sea.prologue!.phase === 'fly');
  expect(sea.prologue).toEqual({ d: PROLOGUE.startD, phase: 'fly', t: 0 });
});

it('на стартовом экране виден дельтаплан с Ниной; подсказки «ПРЫЖОК — ОТЦЕПИТЬСЯ» нет — она появляется в полёте', () => {
  const shot = (g: Game) => {
    const texts: string[] = [], glyphs = new Set<string>();
    drawGame({ push: (x: number, y: number, ch: string) => { glyphs.add(`${x.toFixed(3)},${y.toFixed(3)},${ch}`); }, text: (_x: number, _y: number, s: string) => { texts.push(s); } } as never, g, 1);
    return { texts, glyphs };
  };
  // Все символы дельтаплана с висящей Ниной — там, где он стоит.
  const hasGlider = (g: Game, s: { glyphs: Set<string> }) => {
    const a = gliderAt(g.prologue!.d);
    return gliderGlyphs(a.x, a.bottom, hangPose(CLIPS.get('idle')!.frames[0])).every(q => s.glyphs.has(`${(q.x - 0.5).toFixed(3)},${(q.y - 0.5).toFixed(3)},${q.ch}`));
  };
  const g = title();
  let s = shot(g);
  expect(hasGlider(g, s)).toBe(true);
  expect(s.texts).not.toContain('ПРЫЖОК — ОТЦЕПИТЬСЯ');
  stepGame(g, JUMP, DT);
  s = shot(g);
  expect(hasGlider(g, s)).toBe(true);
  expect(s.texts).toContain('ПРЫЖОК — ОТЦЕПИТЬСЯ');
});
