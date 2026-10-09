import { describe, expect, it } from 'vitest';
import { drawRoom } from '../src/render/scene';
import { roomOf } from './helpers';

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
    expect(g.filter(p => cellOf(p)[1] === 0 && cellOf(p)[0] <= 19)).toHaveLength(0);
  });
});
