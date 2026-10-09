/*
 * Шторм пролога — по мотивам rain, lightning и sea-swell из bas3line/ascii
 * (https://github.com/bas3line/ascii, src/pieces/{rain,lightning,sea-swell}.ts).
 * Copyright (c) 2026 bas3line. MIT License, полный текст — third_party/ascii.rest-LICENSE.
 * Изменено: огибающая вспышки и расписание ударов — из lightning (колонки под 40 клеток);
 * трохоида зыби и символы линии воды — из sea-swell, барашки на гребнях свои; косой дождь —
 * из rain/lightning без луж; всё — глифами в полклетки поверх комнаты, а не кадром текста.
 */
import { ROOM_H, ROOM_W, STORM } from '../config';
import type { Glyph } from '../render/figure';
import type { Color } from '../render/glyphs';
import { PAL } from '../render/palette';
import type { Rect } from '../sim/rect';
import type { Room } from '../world/room';

const TAU = Math.PI * 2;
const SURF = "_.-'"; // линия по тому, где она пересекает клетку, снизу вверх
// Удары: [начало в цикле, с; колонка, где молния выходит из тучи].
const STRIKES: [number, number][] = [[11.94, 17], [2.44, 27.5], [4.62, 10.6], [7.6, 31.9], [9.9, 21.2]];

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const seedOf = (id: string) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const tint = (c: Color, a: number): Color => [c[0], c[1], c[2], Math.min(1, a)];

// Яркость удара через a секунд после начала: лидер, главный разряд, пауза, повтор, послесвечение.
const flash = (a: number) => (a < 0 || a > 1 ? 0 : a < 0.05 ? 0.3 : a < 0.15 ? 1 : a < 0.2 ? 0.15 : a < 0.3 ? 0.9 : 0.9 * Math.exp(-(a - 0.3) / 0.18));

// Самая яркая вспышка в момент time (0 — темно, 1 — главный разряд) и её удар.
export function flashAt(time: number): { lit: number; strike: number; age: number } {
  const u = ((time % STORM.flashLoop) + STORM.flashLoop) % STORM.flashLoop;
  let best = { lit: 0, strike: -1, age: 0 };
  STRIKES.forEach(([start], i) => {
    for (const a of [u - start, u - start + STORM.flashLoop]) {
      const f = flash(a);
      if (f > best.lit) best = { lit: f, strike: i, age: a };
    }
  });
  return best;
}

// Гребень гор за комнатой, строка (y вниз) в колонке x.
export const ridgeY = (x: number, seed: number) => STORM.ridge - 2.2 * Math.sin(x * 0.16 + seed) - 1.1 * Math.sin(x * 0.41 + seed * 0.7);

// Капля i в момент time: голова (x, y), клетки. Падает вниз и влево — ветер справа.
export function rainDrop(i: number, time: number): { x: number; y: number; len: number } {
  const speed = STORM.rainSpeed * (0.7 + 0.6 * hash(i, 1));
  const span = ROOM_H + 2;
  const y = (((hash(i, 2) * span + time * speed) % span) + span) % span - 1;
  const w = ROOM_W + STORM.slant * span;
  const x = ((((hash(i, 3) * w - STORM.slant * y) % w) + w) % w) - STORM.slant * 2;
  return { x, y, len: 1 + Math.floor(hash(i, 4) * 3) };
}

// Трохоида: -0.5 в подошве, 0.5 на гребне (из sea-swell).
function trochoid(u: number, q: number): number {
  let v = u;
  for (let i = 0; i < 4; i++) v = u + (q / TAU) * Math.sin(TAU * v);
  return 0.5 * Math.cos(TAU * v);
}

// Подъём зыби в колонке x: доля от -0.5 (подошва) до 0.5 (гребень); бежит вправо, к берегу.
export const swellH = (x: number, time: number) => trochoid(x / STORM.swellLen - time * STORM.swellHz, 0.5);

const open = (room: Room, x: number, y: number) => room.tiles[Math.floor(y)]?.[Math.floor(x)] === '.';

// Всё, что шторм рисует в комнате с «sky: storm»: горы и силуэт НИИ (ярче во вспышку), молния, косой дождь, зыбь с барашками.
// skip — прямоугольник дельтаплана: горы внутри него не рисуются, чтобы вспышка не заслоняла его.
export function stormGlyphs(room: Room, time: number, skip?: Rect): Glyph[] {
  const out: Glyph[] = [];
  const put = (x: number, y: number, ch: string, color: Color) => {
    if (x >= 0 && x < ROOM_W && y >= 0 && y < ROOM_H) out.push({ x, y, ch, color, size: 0.5 });
  };
  const { lit, strike, age } = flashAt(time);
  const seed = seedOf(room.id) % 100;
  const covered = (x: number, y: number) => !!skip && x >= skip.x && x <= skip.x + skip.w && y >= skip.y && y <= skip.y + skip.h;
  // Горы: линия гребня, во вспышку — освещённые склоны под ней.
  for (let i = 0; i < ROOM_W * 2; i++) {
    const x = (i + 0.5) / 2, y = ridgeY(x, seed);
    const r = Math.floor(y * 2) / 2;
    if (open(room, x, r) && !covered(x, r + 0.25)) put(x, r + 0.25, SURF[Math.min(3, Math.floor((1 - (y * 2 - Math.floor(y * 2))) * 4))], tint(PAL.storm, 0.2 + 0.8 * lit));
    if (lit > 0.08) {
      for (let k = 1; k <= 8; k++) {
        const yy = r + k / 2, g = lit * (1.1 - k / 8) - 0.2;
        if (g > 0.08 && open(room, x, yy) && !covered(x, yy + 0.25)) put(x, yy + 0.25, g > 0.55 ? '=' : g > 0.3 ? '-' : '.', tint(PAL.storm, 0.3 + 0.6 * lit));
      }
    }
  }
  // Силуэт НИИ на гребне: «nii: колонка» в шапке комнаты.
  if (room.meta.nii) {
    const nii = Number(room.meta.nii);
    const base = ridgeY(nii + 4, seed), top = base - 5;
    const c = tint(PAL.storm, 0.25 + 0.75 * lit);
    for (let x = nii; x <= nii + 8; x += 0.5) put(x + 0.25, top, '_', c);
    for (let y = top + 0.5; y < base; y += 0.5) { put(nii + 0.25, y, '|', c); put(nii + 8.25, y, '|', c); }
    for (let y = top - 3; y < top; y += 0.5) put(nii + 6.25, y, '|', c); // мачта на крыше
    if (lit > 0.3) for (let y = top + 1; y < base - 0.5; y += 1.5) for (let x = nii + 1.5; x < nii + 8; x += 1.5) put(x, y, '·', tint(PAL.foam, lit));
  }
  // Молния: зигзаг от тучи до гребня.
  if (strike >= 0 && lit > 0.12) {
    let x = STRIKES[strike][1];
    const end = ridgeY(x, seed);
    const reach = age < 0.05 ? (age / 0.05) * 0.8 : 1;
    for (let k = 0, y = 1; y < end * reach; k++, y += 0.5) {
      const h = hash(strike * 101 + k, Math.floor(time / STORM.flashLoop));
      const dx = h < 0.25 ? 0 : h < 0.62 ? -0.5 : 0.5;
      if (open(room, x, y)) put(x, y, dx < 0 ? '/' : dx > 0 ? '\\' : '|', tint(PAL.foam, lit > 0.4 ? 1 : 0.5));
      x += dx;
    }
  }
  // Дождь: косые штрихи в полклетки; в стенах и в воде не рисуется.
  for (let i = 0; i < STORM.drops; i++) {
    const d = rainDrop(i, time);
    for (let j = 0; j < d.len; j++) {
      const y = d.y - j * 0.5, x = d.x + j * 0.5 * STORM.slant;
      if (open(room, x, y)) put(x, y, d.len > 1 ? '/' : ',', tint(PAL.storm, 0.35 + 0.15 * j + 0.4 * lit));
    }
  }
  // Зыбь: над верхним рядом воды — линия волны, на гребнях барашки, под линией — блики.
  for (let i = 0; i < ROOM_W * 2; i++) {
    const x = (i + 0.5) / 2, c = Math.floor(x);
    const top = room.tiles.findIndex(row => row[c] === '~');
    if (top < 0) continue;
    const h = swellH(x, time), hn = swellH(x + 0.5, time);
    const y = top - 0.5 - 2 * STORM.swellAmp * h; // поверхность, клетки
    const ch = Math.abs(hn - h) * 2 * STORM.swellAmp > 0.4 ? (hn > h ? '/' : '\\') : SURF[Math.min(3, Math.floor((1 - (y * 2 - Math.floor(y * 2))) * 4))];
    put(x, Math.floor(y * 2) / 2 + 0.25, ch, PAL.water);
    if (h > STORM.foam) put(x, Math.floor(y * 2) / 2 - 0.25, hash(i, Math.floor(time * 6)) < 0.5 ? '*' : '~', tint(PAL.foam, 0.6 + 0.4 * lit));
    for (let yy = Math.floor(y * 2) / 2 + 0.75; yy < top; yy += 0.5) if (hash(i * 7, Math.floor(yy * 2)) < 0.35) put(x, yy, '~', tint(PAL.water, 0.5));
  }
  return out;
}
