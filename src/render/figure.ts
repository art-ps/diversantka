import { BONES, J, JOINTS, type Pose } from '../anim/clip';
import type { Color, GlyphBatch } from './glyphs';

const STEP = 0.3; // клеток между символами вдоль кости
const GLYPH = 0.5; // символ фигуры — полклетки
const TORSO = 0.3; // сдвиг боковых линий корпуса, клеток
const FAR = 0.7; // яркость дальней стороны тела

// Символ по наклону отрезка в экранных координатах (y вниз).
export function glyphForAngle(dx: number, dy: number): string {
  let a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (a < 0) a += 180;
  if (a < 22.5 || a >= 157.5) return '-';
  if (a < 67.5) return '\\';
  if (a < 112.5) return '|';
  return '/';
}

export interface Glyph { x: number; y: number; ch: string; color: Color; size: number } // x, y — центр символа

// Символы вдоль костей: points — экранные точки суставов, bones — пары индексов.
export function boneGlyphs(points: (readonly [number, number])[], bones: [number, number][], color: Color, dimFor?: (bone: number) => boolean, thick?: (bone: number) => boolean): Glyph[] {
  const dim: Color = [color[0] * FAR, color[1] * FAR, color[2] * FAR, color[3]];
  const out: Glyph[] = [];
  bones.forEach(([a, b], k) => {
    const [x0, y0] = points[a], [x1, y1] = points[b];
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.round(Math.hypot(dx, dy) / STEP));
    const ch = glyphForAngle(dx, dy);
    const c = dimFor?.(k) ? dim : color;
    // Корпус — три параллельные линии, чтобы читался как тело.
    const len = Math.hypot(dx, dy) || 1;
    for (const o of thick?.(k) ? [-TORSO, 0, TORSO] : [0]) {
      const px = (-dy / len) * o, py = (dx / len) * o;
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        out.push({ x: x0 + dx * t + px, y: y0 + dy * t + py, ch, color: c, size: GLYPH });
      }
    }
  });
  return out;
}

// symmetric — вид со спины на лестнице: обе стороны на одной глубине, не затемняем.
// x, y — точка на земле под тазом, в клетках экрана. Камера сбоку: при взгляде вправо дальняя сторона — правая.
export function figureGlyphs(pose: Pose, x: number, y: number, facing: 1 | -1, color: Color, symmetric = false, head = 'O'): Glyph[] {
  const far = facing === 1 ? 'r' : 'l';
  const points = JOINTS.map((_, j) => [x + facing * pose[2 * j], y - pose[2 * j + 1]] as const);
  const bones = BONES.map(([a, b]) => [J[a], J[b]] as [number, number]);
  const out = boneGlyphs(points, bones, color,
    k => !symmetric && BONES[k][1].startsWith(far),
    k => BONES[k][0] === 'neck' && BONES[k][1] === 'pelvis');
  out.push({ x: points[J.head][0], y: points[J.head][1], ch: head, color, size: 1 });
  return out;
}

export function drawFigure(b: Pick<GlyphBatch, 'push'>, pose: Pose, x: number, y: number, facing: 1 | -1, color: Color, symmetric = false, head = 'O'): void {
  for (const g of figureGlyphs(pose, x, y, facing, color, symmetric, head)) b.push(g.x - 0.5, g.y - 0.5, g.ch, g.color, g.size);
}
