import { BIKE } from '../config';
import { J, type Pose } from '../anim/clip';
import { figureGlyphs, type Glyph } from './figure';
import type { Color, GlyphBatch } from './glyphs';
import { PAL } from './palette';

// Дорожный мотоцикл 80-х (ИЖ/Ява), вид сбоку, фара справа. Символ — полклетки:
// строка — 0.5 клетки по Y, шаг по X — STEP (буквы уже клетки, как в тексте). Ступицы — спицы.
export const BIKE_ART = [
  '            ___   ',
  '     ____  /  o<  ',
  '  __/====\\_|_/    ',
  ' /  |####|    \\   ',
  '( - )---=====( - )',
  ' \\_/  ——       \\_/',
];

const STEP = 0.3;
const COLS = BIKE_ART[0].length;
export const BIKE_W = COLS * STEP; // 5.4 клетки
export const BIKE_H = BIKE_ART.length / 2; // 3 клетки
const HUBS = [[4, 2], [4, 15]];
const SPOKES = '-\\|/'; // поворот по часовой стрелке на экране — колесо катится вправо
const WHEEL: Color = [PAL.item[0] * 0.7, PAL.item[1] * 0.7, PAL.item[2] * 0.7, PAL.item[3]];

const isWheel = (r: number, c: number) => r >= 4 && (c <= 4 || c >= COLS - 5);
// Центр символа (r, c); x — центр мотоцикла, bottom — верх пола под колёсами.
const colX = (x: number, c: number) => x - BIKE_W / 2 + (c + 0.5) * STEP;
const rowY = (bottom: number, r: number) => bottom - (BIKE_ART.length - r - 0.5) * 0.5;

// Сиденье (верх «____»), левый край руля и конец глушителя — относительно (x, bottom).
export const BIKE_SEAT = { dx: colX(0, 6), dy: -2.05 } as const;
export const BIKE_BAR = { dx: colX(0, 12), dy: -2.5 } as const;
export const BIKE_PIPE = { dx: colX(0, 5), dy: rowY(0, 5) } as const;

// Символ спицы после пути dist (клеток): смена каждые 45° поворота колеса.
export function spokeGlyph(dist: number): string {
  const k = Math.floor(dist / ((BIKE.wheelR * Math.PI) / 4));
  return SPOKES[((k % 4) + 4) % 4];
}

export function bikeGlyphs(x: number, bottom: number, dist: number): Glyph[] {
  const spoke = spokeGlyph(dist);
  const out: Glyph[] = [];
  BIKE_ART.forEach((row, r) => {
    [...row].forEach((c0, c) => {
      const ch = HUBS.some(([hr, hc]) => hr === r && hc === c) ? spoke : c0;
      if (ch === ' ') return;
      out.push({ x: colX(x, c), y: rowY(bottom, r), ch, color: isWheel(r, c) ? WHEEL : PAL.item, size: 0.5 });
    });
  });
  return out;
}

export function drawBike(b: Pick<GlyphBatch, 'push'>, x: number, bottom: number, dist: number): void {
  for (const g of bikeGlyphs(x, bottom, dist)) b.push(g.x - 0.5, g.y - 0.5, g.ch, g.color, g.size);
}

// Нина в седле: последняя поза приседа, таз на сиденье, кисти на руле, локти чуть вверх.
export function ridePose(crouch: Pose): Pose {
  const p = [...crouch];
  const px = p[2 * J.pelvis], py = p[2 * J.pelvis + 1];
  const hx = px + BIKE_BAR.dx - BIKE_SEAT.dx, hy = py - (BIKE_BAR.dy - BIKE_SEAT.dy);
  for (const [s, e, h] of [[J.lShoulder, J.lElbow, J.lHand], [J.rShoulder, J.rElbow, J.rHand]]) {
    p[2 * h] = hx;
    p[2 * h + 1] = hy;
    p[2 * e] = (p[2 * s] + hx) / 2;
    p[2 * e + 1] = (p[2 * s + 1] + hy) / 2 + 0.2;
  }
  return p;
}

// Нина на мотоцикле в точке (x, bottom); pose — из ridePose.
export function riderGlyphs(x: number, bottom: number, pose: Pose): Glyph[] {
  const px = pose[2 * J.pelvis], py = pose[2 * J.pelvis + 1];
  return figureGlyphs(pose, x + BIKE_SEAT.dx - px, bottom + BIKE_SEAT.dy + py, 1, PAL.nina);
}
