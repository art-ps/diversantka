import { J, type Pose } from '../anim/clip';
import { figureGlyphs, type Glyph } from './figure';
import type { GlyphBatch } from './glyphs';
import { PAL } from './palette';

// Дельтаплан: крыло-треугольник, стойка, трапеция. Символ — полклетки: строка — 0.5 клетки по Y,
// шаг по X — STEP. Нижняя строка — перекладина трапеции, за неё держится Нина.
export const GLIDER_ART = [
  '         .         ',
  "      .-'|'-.      ",
  "   .-'   |   '-.   ",
  ".-'______|______'-.",
  '        /|\\        ',
  '       / | \\       ',
  '      /__|__\\      ',
];

const STEP = 0.3;
const COLS = GLIDER_ART[0].length;
export const GLIDER_W = COLS * STEP; // 5.7 клетки

const len = (p: Pose, a: number, b: number) => Math.hypot(p[2 * a] - p[2 * b], p[2 * a + 1] - p[2 * b + 1]);

// Нина висит на руках: из позы покоя кисти уходят вверх на длину руки, обе — на одну перекладину.
export function hangPose(idle: Pose): Pose {
  const p = [...idle];
  const arms = [[J.lShoulder, J.lElbow, J.lHand, -0.15], [J.rShoulder, J.rElbow, J.rHand, 0.15]] as const;
  const bar = Math.min(...arms.map(([s, e, h]) => p[2 * s + 1] + len(idle, s, e) + len(idle, e, h)));
  for (const [s, e, h, dx] of arms) {
    p[2 * h] = p[2 * s] + dx;
    p[2 * h + 1] = bar;
    p[2 * e] = p[2 * s] + dx * 1.5; // локти чуть в стороны — руки не сливаются
    p[2 * e + 1] = (p[2 * s + 1] + bar) / 2;
  }
  return p;
}

// Дельтаплан с Ниной: x — центр, bottom — низ ног; pose — из hangPose.
export function gliderGlyphs(x: number, bottom: number, pose: Pose): Glyph[] {
  const barY = bottom - pose[2 * J.lHand + 1];
  const out: Glyph[] = [];
  GLIDER_ART.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === ' ') return;
      out.push({ x: x - GLIDER_W / 2 + (c + 0.5) * STEP, y: barY - (GLIDER_ART.length - 1 - r) * 0.5, ch, color: PAL.ladder, size: 0.5 });
    });
  });
  return [...out, ...figureGlyphs(pose, x, bottom, 1, PAL.nina)];
}

export function drawGlider(b: Pick<GlyphBatch, 'push'>, x: number, bottom: number, pose: Pose): void {
  for (const g of gliderGlyphs(x, bottom, pose)) b.push(g.x - 0.5, g.y - 0.5, g.ch, g.color, g.size);
}
