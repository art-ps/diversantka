import { describe, expect, it } from 'vitest';
import { J, type Pose } from '../src/anim/clip';
import { drawFigure, glyphForAngle } from '../src/render/figure';
import type { Color } from '../src/render/glyphs';

describe('glyphForAngle (экранные координаты, y вниз)', () => {
  it.each([
    [1, 0, '-'], [-1, 0, '-'],
    [0, 1, '|'], [0, -1, '|'],
    [1, 1, '\\'], [-1, -1, '\\'],
    [1, -1, '/'], [-1, 1, '/'],
  ])('(%d, %d) → %s', (dx, dy, ch) => expect(glyphForAngle(dx, dy)).toBe(ch));
});

describe('drawFigure', () => {
  // Стоящая фигура: голова сверху, стопы на земле, левая рука вытянута вперёд.
  const pose: Pose = new Array(26).fill(0);
  const set = (j: number, x: number, y: number) => { pose[2 * j] = x; pose[2 * j + 1] = y; };
  set(J.head, 0, 5.5); set(J.neck, 0, 4.5); set(J.pelvis, 0, 2.6);
  set(J.lShoulder, 0.1, 4.4); set(J.lElbow, 1, 4.4); set(J.lHand, 2, 4.4);
  set(J.rShoulder, -0.1, 4.4); set(J.rElbow, -0.1, 3.4); set(J.rHand, -0.1, 2.6);
  set(J.lKnee, 0.2, 1.3); set(J.lFoot, 0.2, 0); set(J.rKnee, -0.2, 1.3); set(J.rFoot, -0.2, 0);

  const capture = (facing: 1 | -1, symmetric = false) => {
    const out: { x: number; y: number; ch: string; c: Color }[] = [];
    drawFigure({ push: (x, y, ch, c) => { out.push({ x, y, ch, c }); } }, pose, 10, 20, facing, [1, 1, 1, 1], symmetric);
    return out;
  };

  it('рисует голову и кости над точкой опоры', () => {
    const g = capture(1);
    expect(g.find(p => p.ch === 'O')).toBeTruthy();
    expect(g.length).toBeGreaterThan(12);
    for (const p of g) {
      expect(p.y).toBeLessThanOrEqual(20);
      expect(p.y).toBeGreaterThan(13);
    }
  });

  it('взгляд влево зеркалит по x, но не переворачивает', () => {
    const r = capture(1), l = capture(-1);
    const hand = (g: typeof r) => Math.max(...g.map(p => Math.abs(p.x + 0.5 - 10)));
    expect(hand(l)).toBeCloseTo(hand(r));
    expect(Math.max(...r.map(p => p.x))).toBeGreaterThan(11);
    expect(Math.min(...l.map(p => p.x))).toBeLessThan(9);
    const headY = (g: typeof r) => g.find(p => p.ch === 'O')!.y;
    expect(headY(l)).toBeCloseTo(headY(r));
  });

  it('дальние конечности тусклее ближних', () => {
    const g = capture(1);
    const levels = new Set(g.map(p => p.c[0]));
    expect(levels.size).toBeGreaterThan(1);
  });

  it('symmetric: ни одна сторона не затемняется', () => {
    const g = capture(1, true);
    expect(new Set(g.map(p => p.c[0])).size).toBe(1);
  });
});
