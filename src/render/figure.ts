import { BONES, J, type Pose } from '../anim/clip';
import type { Color, GlyphBatch } from './glyphs';

const STEP = 0.3; // клеток между символами вдоль кости
const GLYPH = 0.5; // символ фигуры — полклетки
const FAR = 0.55; // яркость дальней стороны тела

// Символ по наклону отрезка в экранных координатах (y вниз).
export function glyphForAngle(dx: number, dy: number): string {
  let a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (a < 0) a += 180;
  if (a < 22.5 || a >= 157.5) return '-';
  if (a < 67.5) return '\\';
  if (a < 112.5) return '|';
  return '/';
}

// x, y — точка на земле под тазом, в клетках экрана. Камера сбоку: при взгляде вправо дальняя сторона — правая.
export function drawFigure(b: Pick<GlyphBatch, 'push'>, pose: Pose, x: number, y: number, facing: 1 | -1, color: Color): void {
  const far = facing === 1 ? 'r' : 'l';
  const dim: Color = [color[0] * FAR, color[1] * FAR, color[2] * FAR, color[3]];
  const at = (j: number) => [x + facing * pose[2 * j], y - pose[2 * j + 1]] as const;
  for (const [from, to] of BONES) {
    const [x0, y0] = at(J[from]);
    const [x1, y1] = at(J[to]);
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.round(Math.hypot(dx, dy) / STEP));
    const ch = glyphForAngle(dx, dy);
    const c = to.startsWith(far) ? dim : color;
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps;
      b.push(x0 + dx * t - 0.5, y0 + dy * t - 0.5, ch, c, GLYPH);
    }
  }
  const [hx, hy] = at(J.head);
  b.push(hx - 0.5, hy - 0.5, 'O', color, 0.7);
}
