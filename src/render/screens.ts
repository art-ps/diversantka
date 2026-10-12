import { BIKE, MISSION, ROOM_W, TITLE } from '../config';
import type { Pose } from '../anim/clip';
import type { MissionResult } from '../sim/mission';
import { bootLines, menuItems, type Screen } from '../sim/terminal';
import { BIKE_DIR, BIKE_PIPE, bikeGlyphs, riderGlyphs } from './bike';
import type { Glyph } from './figure';
import type { Color, GlyphBatch } from './glyphs';
import { PAL } from './palette';

const STEP = 0.6; // шаг букв, как в HUD
const X0 = 4, X1 = 35, Y0 = 3, Y1 = 21; // рамка экранов

// Рамка в клетках, включительно: углы «+», верх и низ «=», бока «|».
export interface Box { x0: number; x1: number; y0: number; y1: number }

export function drawFrame(b: Pick<GlyphBatch, 'push'>, c: Color, f: Box = { x0: X0, x1: X1, y0: Y0, y1: Y1 }): void {
  for (let x = f.x0; x <= f.x1; x++) {
    const ch = x === f.x0 || x === f.x1 ? '+' : '=';
    b.push(x, f.y0, ch, c);
    b.push(x, f.y1, ch, c);
  }
  for (let y = f.y0 + 1; y < f.y1; y++) {
    b.push(f.x0, y, '|', c);
    b.push(f.x1, y, '|', c);
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

// Перенос по словам: строка итога шире рамки.
export function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    if (cur && cur.length + 1 + w.length > n) {
      out.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) out.push(cur);
  return out;
}

const WIDE = Math.floor((X1 - X0 - 3) / STEP); // букв в строке внутри рамки

export function drawResult(b: Pick<GlyphBatch, 'push' | 'text'>, r: MissionResult, copied: boolean): void {
  drawFrame(b, PAL.hudDim);
  const rows = ['МИССИЯ ВЫПОЛНЕНА', '', `ВРЕМЯ   ${r.time}`, `ЛЕНТЫ   ${r.tapes}`, `УДАРОВ  ${r.hits}`, `ИСТОЧНИК НАЙДЕН: ${r.secret ? 'ДА' : 'НЕТ'}`];
  rows.forEach((s, i) => b.text(X0 + 2, Y0 + 2 + i, s, i === 0 ? PAL.item : PAL.hud, STEP));
  wrap(r.line, WIDE).forEach((s, i) => b.text(X0 + 2, Y0 + 10 + i, s, PAL.hudDim, STEP));
  b.text(X0 + 2, Y1 - 1, copied ? 'СКОПИРОВАНО · ПРЫЖОК — ЗАНОВО' : 'E/Y — СКОПИРОВАТЬ · ПРЫЖОК — ЗАНОВО', PAL.hudDim, STEP);
}

export function drawFailed(b: Pick<GlyphBatch, 'text'>): void {
  const title = 'МИССИЯ ПРОВАЛЕНА', hint = 'ПРЫЖОК — ЗАНОВО';
  b.text((ROOM_W - title.length * STEP) / 2, 11, title, PAL.danger, STEP);
  b.text((ROOM_W - hint.length * STEP) / 2, 13, hint, PAL.hudDim, STEP);
}

// Стартовый экран: рамка справа от дельтаплана (он висит в колонках 0–6), под ней шторм не рисуется.
export const TITLE_BOX: Box = { x0: 9, x1: 38, y0: 1, y1: 18 };
export const TITLE_NAME = 'ДИВЕРСАНТКА';
export const TITLE_TASK = `${MISSION.tapes} ЛЕНТ · ЭВМ · ЗАБОР · МОТОЦИКЛ. ${MISSION.time / 60} МИНУТ`;
// Действие · клавиатура · геймпад (KEYMAP и fromGamepad в src/input/intent.ts); первая строка — шапка.
export const TITLE_KEYS: readonly [string, string, string][] = [
  ['', 'КЛАВИАТУРА', 'ГЕЙМПАД'],
  ['ХОД', 'СТРЕЛКИ/WASD', 'СТИК/КРЕСТ'],
  ['ПРЫЖОК', 'ПРОБЕЛ', 'A'],
  ['УДАР', 'J', 'X'],
  ['БРОСОК', 'K', 'B'],
  ['ТЕРМИНАЛ/ЛИФТ', 'E', 'Y'],
  ['ПАУЗА', 'ESC', 'START'],
  ['ЗВУК', 'M', '—'],
];
export const TITLE_START = 'ПРОБЕЛ — НАЧАТЬ';
export const TITLE_FOCUS = 'КЛИК ПО ЭКРАНУ, ЕСЛИ КЛАВИШИ НЕ РАБОТАЮТ';
const KEY_COLS = [0, 14, 27]; // начала колонок таблицы, в буквах

export function drawTitle(b: Pick<GlyphBatch, 'push' | 'text'>, time: number): void {
  const f = TITLE_BOX, mid = (f.x0 + f.x1 + 1) / 2, left = f.x0 + 2;
  const centered = (y: number, s: string, c: Color, step = STEP) => b.text(mid - (s.length * step) / 2, y, s, c, step);
  drawFrame(b, PAL.hudDim, f);
  centered(f.y0 + 2, TITLE_NAME, PAL.item, 1);
  centered(f.y0 + 4, TITLE_TASK, PAL.hud);
  TITLE_KEYS.forEach((row, i) => row.forEach((s, j) => {
    if (s) b.text(left + KEY_COLS[j] * STEP, f.y0 + 6 + i, s, i === 0 || j === 0 ? PAL.hudDim : PAL.hud, STEP);
  }));
  if (Math.floor(time * TITLE.blinkHz * 2) % 2 === 0) centered(f.y1 - 2, TITLE_START, PAL.item);
  centered(f.y1 - 1, TITLE_FOCUS, PAL.hudDim);
}

// Выезд: ночная дорога, столб ворот, Нина на мотоцикле разгоняется влево (BIKE_DIR) и уходит за край.
export const OUTRO_ROAD = 19; // верх дороги — низ колёс
export const OUTRO_X0 = ROOM_W - 4; // центр мотоцикла в начале сцены
const GATE_X = ROOM_W - 9; // столб ворот

export function outroBikeX(t: number): number {
  const k = Math.min(1, Math.max(0, t / MISSION.outroTime));
  return OUTRO_X0 + BIKE_DIR * k * k * (ROOM_W + 4);
}

// Дым из глушителя: клуб каждые BIKE.smokeEvery с остаётся там, где вышел, поднимается, сносится назад и тает.
export function outroSmoke(t: number): Glyph[] {
  const out: Glyph[] = [];
  const first = Math.max(0, Math.ceil((t - BIKE.smokeLife) / BIKE.smokeEvery));
  for (let i = first; i * BIKE.smokeEvery <= t; i++) {
    const age = t - i * BIKE.smokeEvery;
    if (age >= BIKE.smokeLife) continue;
    const a = PAL.smoke[3] * (1 - age / BIKE.smokeLife);
    out.push({
      x: outroBikeX(i * BIKE.smokeEvery) + BIKE_DIR * (BIKE_PIPE.dx - age * BIKE.smokeDrift),
      y: OUTRO_ROAD + BIKE_PIPE.dy - age * BIKE.smokeRise,
      ch: '.,~'[i % 3], color: [PAL.smoke[0], PAL.smoke[1], PAL.smoke[2], a], size: 0.5,
    });
  }
  return out;
}

// rider — поза Нины в седле (ridePose).
export function drawOutro(b: Pick<GlyphBatch, 'push'>, t: number, rider: Pose): void {
  for (let i = 0; i < 40; i++) {
    const h = (i * 2654435761) >>> 0;
    b.push(h % ROOM_W, (h >>> 8) % 12, '.', PAL.hudDim, 0.5);
  }
  const shift = Math.floor(t * 20);
  for (let x = 0; x < ROOM_W; x++) {
    b.push(x, 18, '_', PAL.hudDim);
    if ((((x + BIKE_DIR * shift) % 4) + 4) % 4 === 0) b.push(x, 19, '-', PAL.hudDim, 0.5);
  }
  for (let y = 14; y <= 17; y++) b.push(GATE_X, y, '|', PAL.wall);
  const x = outroBikeX(t);
  const glyphs = [...outroSmoke(t), ...bikeGlyphs(x, OUTRO_ROAD, Math.abs(x - OUTRO_X0), BIKE_DIR), ...riderGlyphs(x, OUTRO_ROAD, rider, BIKE_DIR)];
  for (const g of glyphs) b.push(g.x - 0.5, g.y - 0.5, g.ch, g.color, g.size);
}
