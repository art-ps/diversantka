import { expect, it } from 'vitest';
import { CLIPS } from '../src/anim/clips';
import { J } from '../src/anim/clip';
import { DT, NINA, PROLOGUE } from '../src/config';
import { createPrologue, stepGame, type Game } from '../src/game';
import { IDLE } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { GLIDER_ART, gliderGlyphs, hangPose } from '../src/render/glider';
import { drawGame } from '../src/render/scene';
import { gliderAt, gliderRect } from '../src/sim/glider';
import { loadRoomsFs } from './helpers';

const idle = CLIPS.get('idle')!.frames[0];
const HANG = hangPose(idle);
const y = (p: number[], j: number) => p[2 * j + 1];
const shot = (g: Game) => {
  const texts: string[] = [], chars: string[] = [];
  let n = 0;
  const b = {
    push: (_x: number, _y: number, ch: string) => { chars.push(ch); n++; },
    text: (_x: number, _y: number, s: string) => { texts.push(s); chars.push(...s); n += [...s].length; },
  };
  drawGame(b as never, g, 1);
  return { texts, chars, n };
};

it('поза виса: кисти над головой на одной высоте, длина рук та же, ноги как в покое', () => {
  expect(y(HANG, J.lHand)).toBeCloseTo(y(HANG, J.rHand));
  expect(y(HANG, J.lHand)).toBeGreaterThan(y(HANG, J.head));
  const arm = (p: number[], s: number, h: number) => Math.hypot(p[2 * h] - p[2 * s], p[2 * h + 1] - p[2 * s + 1]);
  expect(arm(HANG, J.lShoulder, J.lHand)).toBeLessThanOrEqual(arm(idle, J.lShoulder, J.lElbow) + arm(idle, J.lElbow, J.lHand) + 1e-6);
  for (const j of [J.pelvis, J.lKnee, J.lFoot, J.rKnee, J.rFoot]) expect(HANG.slice(2 * j, 2 * j + 2)).toEqual(idle.slice(2 * j, 2 * j + 2));
});

it('дельтаплан с Ниной: символы из атласа, перекладина — у кистей, рисунок — внутри прямоугольника удара', () => {
  const a = gliderAt(50);
  const gs = gliderGlyphs(a.x, a.bottom, HANG);
  const r = gliderRect(a);
  for (const g of gs) {
    expect(CHARSET).toContain(g.ch);
    expect(g.x - g.size / 2).toBeGreaterThanOrEqual(r.x - 1e-6);
    expect(g.x + g.size / 2).toBeLessThanOrEqual(r.x + r.w + 1e-6);
    expect(g.y - g.size / 2).toBeGreaterThanOrEqual(r.y - 1e-6);
    expect(g.y).toBeLessThanOrEqual(r.y + r.h); // стопы — на низе прямоугольника
  }
  const bar = gs.filter(g => g.ch === '_').map(g => g.y);
  expect(Math.max(...bar)).toBeCloseTo(a.bottom - y(HANG, J.lHand));
  expect(GLIDER_ART[GLIDER_ART.length - 1]).toContain('__');
  expect(gs.filter(g => g.ch === 'O')).toHaveLength(1); // голова одна — Нина под крылом, а не рядом
});

it('экран пролога: в полёте — дельтаплан и подсказка; удар и всплеск — свои надписи; после посадки — ничего', () => {
  const g = createPrologue(loadRoomsFs());
  let s = shot(g);
  expect(s.texts).toContain('ПРЫЖОК — ОТЦЕПИТЬСЯ');
  expect(s.chars.filter(c => c === 'O')).toHaveLength(1);
  for (const ch of s.chars) expect(CHARSET).toContain(ch);
  g.prologue!.phase = 'crash';
  expect(shot(g).texts).toContain('УДАР О МАЧТУ · ЗАНОВО');
  g.prologue!.phase = 'splash';
  s = shot(g);
  expect(s.texts).toContain('В МОРЕ · ЗАНОВО');
  expect(s.texts).not.toContain('ПРЫЖОК — ОТЦЕПИТЬСЯ');
  const h = createPrologue(loadRoomsFs());
  for (let i = 0; i < 3000 && !(h.roomId === 'roof-1' && !h.transition && gliderAt(h.prologue!.d).x >= 15); i++) stepGame(h, IDLE, DT);
  stepGame(h, { ...IDLE, jump: true, jumpPressed: true }, DT);
  for (let i = 0; i < 600 && h.prologue; i++) stepGame(h, IDLE, DT);
  s = shot(h);
  for (const t of ['ПРЫЖОК — ОТЦЕПИТЬСЯ', 'В МОРЕ · ЗАНОВО', 'УДАР О МАЧТУ · ЗАНОВО']) expect(s.texts).not.toContain(t);
  expect(PROLOGUE.height).toBeGreaterThan(NINA.h);
});
