import { describe, expect, it } from 'vitest';
import { drawFloaters, drawGame, drawItems, drawProjectiles, drawRoom, drawStatic } from '../src/render/scene';
import { FX, ROOM_H, ROOM_W } from '../src/config';
import { PAL } from '../src/render/palette';
import { createGame } from '../src/game';
import { loadRoomsFs, roomOf } from './helpers';

type G = { x: number; y: number; ch: string; s: number };
const draw = (rows: Record<number, string>) => {
  const out: G[] = [];
  drawRoom({ push: (x, y, ch, _c, s = 1) => { out.push({ x, y, ch, s }); } }, roomOf(rows), 0, 0, 0, 'test');
  return out;
};
// клетка, в которой лежит центр символа
const cellOf = (g: G) => [Math.floor(g.x + 0.5), Math.floor(g.y + 0.5)];
const inCell = (c: number, r: number) => (g: G) => cellOf(g)[0] === c && cellOf(g)[1] === r;

describe('drawRoom в полклетки', () => {
  it('вода: рябь бежит — символы клетки меняются со временем', () => {
    const at = (time: number) => {
      const out: string[] = [];
      drawRoom({ push: (x, y, ch) => { if (Math.floor(x + 0.5) === 5 && Math.floor(y + 0.5) === 10) out.push(ch); } }, roomOf({ 10: '.....~' }), 0, 0, time, 'test');
      return out.join('');
    };
    const frames = new Set([0, 0.2, 0.4, 0.6, 0.8, 1.0].map(at));
    expect(frames.size).toBeGreaterThan(1);
    for (const f of frames) for (const ch of f) expect('~-.').toContain(ch);
  });

  it('стена — четыре мелких символа на клетку', () => {
    const g = draw({ 10: '..........#' }).filter(inCell(10, 10));
    expect(g).toHaveLength(4);
    expect(g.every(p => p.s === 0.5)).toBe(true);
  });

  it('платформа — два символа в верхней половине клетки', () => {
    const g = draw({ 10: '.....=' }).filter(inCell(5, 10));
    expect(g).toHaveLength(2);
    for (const p of g) expect(p.y + 0.5).toBeLessThan(10.5);
  });

  it('лестница — два рельса и перекладина', () => {
    const g = draw({ 10: '.....H' }).filter(inCell(5, 10));
    expect(g.filter(p => p.ch === '|')).toHaveLength(4);
    expect(g.filter(p => p.ch !== '|')).toHaveLength(1);
  });

  it('фон — не больше четырёх тусклых точек на клетку', () => {
    const g = draw({});
    expect(g.length).toBeGreaterThan(0);
    expect(g.length).toBeLessThan(40 * 25);
  });

  it('под надписями HUD в верхнем ряду ничего не рисуется', () => {
    const g = draw({ 0: '#'.repeat(40) });
    expect(g.filter(p => cellOf(p)[1] === 0 && cellOf(p)[0] <= 12)).toHaveLength(0);
  });
});

describe('предметы и снаряды', () => {
  it('каждый предмет и живой снаряд — один мелкий символ', () => {
    const out: { ch: string; s: number }[] = [];
    const b = { push: (_x: number, _y: number, ch: string, _c: unknown, s = 1) => { out.push({ ch, s }); } };
    drawItems(b, [{ id: 'a', kind: 'knife', x: 5, bottom: 22 }, { id: 'b', kind: 'stone', x: 8, bottom: 22 }], 0, 0);
    drawProjectiles(b, [
      { kind: 'knife', x: 3, y: 3, vx: 1, vy: 0, from: 'nina', damage: 1, alive: true, hitWall: false },
      { kind: 'knife', x: 3, y: 3, vx: 1, vy: 0, from: 'nina', damage: 1, alive: false, hitWall: false },
    ], 0, 0);
    expect(out).toHaveLength(3);
    expect(out.every(g => g.s === 0.5)).toBe(true);
  });
});

describe('всплывающие числа', () => {
  it('drawFloaters центрирует текст и разносит символы на 0.42 с размером 0.7', () => {
    const out: { x: number; ch: string; s: number }[] = [];
    const b = { push: (x: number, _y: number, ch: string, _c: unknown, s = 1) => { out.push({ x, ch, s }); } };
    drawFloaters(b, [{ text: '-12', kind: 'damage', t: 0, x: 10, y: 18 }], 0, 0);

    expect(out).toHaveLength(3);
    expect(out.every(g => g.s === 0.7)).toBe(true);

    // Средний символ центрирован на f.x
    expect(out[1].x + 0.5).toBeCloseTo(10, 3);

    // Шаг между соседними символами ≈ 0.42
    expect(out[1].x - out[0].x).toBeCloseTo(0.42, 2);
    expect(out[2].x - out[1].x).toBeCloseTo(0.42, 2);
  });
  it('огненная яма — drawRoom символов `^` не рисует (их рисует огонь)', () => {
    expect(draw({ 10: '.....^' }).filter(inCell(5, 10)).filter(p => p.ch === '^')).toHaveLength(0);
  });
});

describe('помехи при смерти', () => {
  const collect = (deadT: number, time: number) => {
    const out: { x: number; y: number; ch: string; a: number }[] = [];
    drawStatic({ push: (x, y, ch, c) => { out.push({ x, y, ch, a: c[3] }); } }, deadT, time);
    return out;
  };

  it('в момент смерти помех нет, через staticIn — много', () => {
    expect(collect(0, 3)).toHaveLength(0);
    const full = collect(FX.staticIn, 3);
    expect(full.length).toBeGreaterThan(ROOM_W * ROOM_H * 4 * FX.staticDensity * 0.6);
    for (const g of full) expect(' .:░▒').toContain(g.ch);
  });

  it('снег меняется со временем, но один и тот же кадр — одинаковый', () => {
    expect(collect(2, 3)).toEqual(collect(2, 3));
    expect(collect(2, 3)).not.toEqual(collect(2, 3.2));
  });

  it('HUD поверх помех: надпись рисуется после снега', () => {
    const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
    g.nina.dead = true; g.nina.deadT = 2;
    const seq: { snow: boolean; text?: string }[] = [];
    const b = {
      push: (_x: number, _y: number, _ch: string, c: number[]) => { seq.push({ snow: c[0] === PAL.static[0] && c[1] === PAL.static[1] && c[2] === PAL.static[2] }); },
      text: (_x: number, _y: number, s: string) => { seq.push({ snow: false, text: s }); },
    };
    drawGame(b as never, g, 3);
    const lastSnow = seq.map((s, i) => (s.snow ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const msg = seq.findIndex(s => s.text?.startsWith('ПОГИБЛА'));
    expect(lastSnow).toBeGreaterThan(-1);
    expect(msg).toBeGreaterThan(lastSnow);
  });
});
