import { describe, expect, it } from 'vitest';
import { drawGame } from '../src/render/scene';
import { createGame, createPrologue } from '../src/game';
import { loadRoomsFs } from './helpers';

const START = { room: 'shaft-top', x: 10, bottom: 22 };

type Push = (x: number, y: number, ch: string, c: readonly number[], s?: number) => void;
const batches = () => {
  const main: string[] = [], fig: string[] = [];
  const b = { push: ((_x, _y, ch) => { main.push(ch); }) as Push, text: () => {} };
  const f = { push: ((_x, _y, ch) => { fig.push(ch); }) as Push };
  return { b, f, main, fig };
};

describe('свечение фигур: отдельный батч', () => {
  it('героиня и враги — в fig, стены и HUD — в основном', () => {
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
});
