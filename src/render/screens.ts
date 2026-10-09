import { MISSION } from '../config';
import { bootLines, menuItems, type Screen } from '../sim/terminal';
import type { Color, GlyphBatch } from './glyphs';
import { PAL } from './palette';

const STEP = 0.6; // шаг букв, как в HUD
const X0 = 4, X1 = 35, Y0 = 3, Y1 = 21; // рамка экранов

export function drawFrame(b: Pick<GlyphBatch, 'push'>, c: Color): void {
  for (let x = X0; x <= X1; x++) {
    const ch = x === X0 || x === X1 ? '+' : '=';
    b.push(x, Y0, ch, c);
    b.push(x, Y1, ch, c);
  }
  for (let y = Y0 + 1; y < Y1; y++) {
    b.push(X0, y, '|', c);
    b.push(X1, y, '|', c);
  }
}

// Экран ЭВМ: лог загрузки, затем меню и ответ на последний выбор.
export function drawScreen(b: Pick<GlyphBatch, 'push' | 'text'>, s: Screen): void {
  drawFrame(b, PAL.hudDim);
  bootLines(s.t).forEach((l, i) => b.text(X0 + 2, Y0 + 2 + i, l, PAL.hud, STEP));
  if (s.t < MISSION.bootTime) return;
  menuItems(s.term).forEach((item, i) => {
    const on = i === s.sel;
    b.text(X0 + 2, Y0 + 9 + i, (on ? '> ' : '  ') + item.label, on ? PAL.item : PAL.hud, STEP);
  });
  if (s.msg) b.text(X0 + 2, Y1 - 3, s.msg, PAL.item, STEP);
  b.text(X0 + 2, Y1 - 1, 'СТРЕЛКИ — ВЫБОР · ПРЫЖОК/E — ДА', PAL.hudDim, STEP);
}
