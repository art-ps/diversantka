import { describe, expect, it } from 'vitest';
import { drawGame } from '../src/render/scene';
import { createGame, createPrologue, stepGame } from '../src/game';
import { DT } from '../src/config';
import { IDLE } from '../src/input/intent';
import { PAL } from '../src/render/palette';
import { loadRoomsFs } from './helpers';

const START = { room: 'shaft-top', x: 10, bottom: 22 };

type Push = (x: number, y: number, ch: string, c: readonly number[], s?: number) => void;
const batches = () => {
  const main: string[] = [], fig: string[] = [];
  const mainC: (readonly number[])[] = [], figC: (readonly number[])[] = [];
  const b = { push: ((_x, _y, ch, c) => { main.push(ch); mainC.push(c); }) as Push, text: () => {} };
  const f = { push: ((_x, _y, ch, c) => { fig.push(ch); figC.push(c); }) as Push };
  return { b, f, main, fig, mainC, figC };
};

describe('свечение фигур: отдельный батч', () => {
  it('героиня — в fig, стены — в основном', () => {
    const g = createGame(loadRoomsFs(), START);
    const { b, f, main, fig } = batches();
    drawGame(b as never, g, 1, f as never);
    expect(fig).toContain('O'); // голова героини
    expect(fig.length).toBeGreaterThan(5);
    expect(main).toContain('#'); // стены
    expect(main).not.toContain('O');
  });

  it('без fig всё идёт в основной батч — старые вызовы живы', () => {
    const g = createGame(loadRoomsFs(), START);
    const { b, main } = batches();
    drawGame(b as never, g, 1);
    expect(main).toContain('O');
  });

  it('дельтаплан пролога — в основном батче, не в fig', () => {
    const g = createPrologue(loadRoomsFs(), false);
    const { b, f, main, fig } = batches();
    drawGame(b as never, g, 1, f as never);
    expect(fig).toHaveLength(0);
    expect(main.length).toBeGreaterThan(0);
  });

  it('андроид — в fig, не в основном', () => {
    const g = createGame(loadRoomsFs(), { room: 'boiler', x: 10, bottom: 22 });
    for (let i = 0; i < 20; i++) stepGame(g, IDLE, DT);
    expect(g.androids.length).toBeGreaterThan(0);
    const { b, f, fig, mainC, figC } = batches();
    drawGame(b as never, g, 1, f as never);
    const isAndroid = (c: readonly number[]) => c[0] === PAL.android[0] && c[1] === PAL.android[1] && c[2] === PAL.android[2];
    expect(fig).toContain('@'); // голова андроида (в основном '@' бывает и у декора, поэтому main — по цвету)
    expect(figC.some(isAndroid)).toBe(true);
    expect(mainC.some(isAndroid)).toBe(false);
  });

  it('собака — в fig (по цвету), не в основном', () => {
    const g = createGame(loadRoomsFs(), { room: 'cave-1', x: 14, bottom: 22 });
    for (let i = 0; i < 20; i++) stepGame(g, IDLE, DT);
    expect(g.dogs.length).toBeGreaterThan(0);
    const { b, f, mainC, figC } = batches();
    drawGame(b as never, g, 1, f as never);
    const isDog = (c: readonly number[]) => c[0] === PAL.dog[0] && c[1] === PAL.dog[1] && c[2] === PAL.dog[2];
    expect(figC.some(isDog)).toBe(true);
    expect(mainC.some(isDog)).toBe(false);
  });
});
