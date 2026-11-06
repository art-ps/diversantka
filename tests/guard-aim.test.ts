import { describe, expect, it } from 'vitest';
import { drawGame, raiseRifle } from '../src/render/scene';
import { simplePose } from '../src/anim/simple';
import { CLIPS } from '../src/anim/clips';
import { J } from '../src/anim/clip';
import { createGame } from '../src/game';
import { GUARD } from '../src/config';
import { createGuard, type GuardState } from '../src/sim/guard';
import { loadRoomsFs } from './helpers';

const START = { room: 'shaft-top', x: 10, bottom: 22 };

// Рисует одного охранника в заданном состоянии, возвращает «—» ружья и прочие символы фигуры (координаты — центры клеток).
const draw = (state: GuardState, facing: 1 | -1) => {
  const g = createGame(loadRoomsFs(), START);
  g.androids.length = 0; g.guards.length = 0;
  const gd = createGuard('t#g', { kind: 'guard', x: 20, bottom: 22, patrol: [10, 30] });
  gd.state = state; gd.facing = facing;
  g.guards.push(gd);
  const gun: [number, number][] = [], rest: [number, number][] = [];
  const f = { push: (x: number, y: number, ch: string) => { (ch === '—' ? gun : rest).push([x + 0.5, y + 0.5]); } };
  drawGame({ push: () => {}, text: () => {} } as never, g, 1, f as never);
  return { gun, rest, gd, cx: gd.body.x + gd.body.w / 2, bottom: gd.body.y + gd.body.h };
};

describe('ружьё охранника', () => {
  for (const state of ['aim', 'reload'] as const) {
    for (const facing of [1, -1] as const) {
      it(`${state}, взгляд ${facing}: ствол на линии пули, впереди охранника, рука доходит до ствола`, () => {
        const { gun, rest, cx, bottom } = draw(state, facing);
        expect(gun).toHaveLength(GUARD.gun);
        for (const [x, y] of gun) {
          expect(y).toBeCloseTo(bottom - GUARD.chest, 5);
          expect((x - cx) * facing).toBeGreaterThan(0);
        }
        const [x0, y0] = gun[0];
        expect(rest.some(([x, y]) => Math.hypot(x - x0, y - y0) < 0.6)).toBe(true);
      });
    }
  }

  it('patrol: ружьё у опущенной руки, ниже линии пули', () => {
    const { gun, bottom } = draw('patrol', 1);
    expect(gun).toHaveLength(GUARD.gun);
    for (const [, y] of gun) expect(y).toBeGreaterThan(bottom - GUARD.chest + 0.5);
  });

  it('aim: ствол на уровне правого плеча позы', () => {
    const { gun, gd, bottom } = draw('aim', 1);
    const shoulder = simplePose(gd.anim, CLIPS)[2 * J.rShoulder + 1];
    for (const [, y] of gun) expect(Math.abs(bottom - y - shoulder)).toBeLessThanOrEqual(0.3);
  });

  it('aim: рука согнута — локоть ниже кисти', () => {
    const { gd } = draw('aim', 1);
    const p = raiseRifle(simplePose(gd.anim, CLIPS));
    expect(p[2 * J.rHand + 1] - p[2 * J.rElbow + 1]).toBeGreaterThanOrEqual(0.2);
  });
});
