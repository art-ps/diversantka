/*
 * Поле жара — ядро doom-fire из bas3line/ascii (https://github.com/bas3line/ascii,
 * src/pieces/doom-fire.ts). Copyright (c) 2026 bas3line. MIT License, полный текст —
 * third_party/ascii.rest-LICENSE. Изменено: поле общего вида (источник — строка h-1,
 * поток к строке 0), без кадрирования в текст; языки — шумом по колонкам.
 */

export const HEAT_MAX = 36;
export const HEAT_RAMP = ' .:;!+*#%@'; // от холодного к белому
export const HEAT_RATE = 24; // шагов распространения в секунду
const DRIFT = 34; // шагов, за которые высота языка «гуляет» через один узел шума
const FLOOR = 0.16; // ниже — не рисуется

export interface HeatField {
  w: number; h: number;
  heat: Float32Array; // w*h, строка h-1 — очаг
  bed: Float32Array; // жар очага по колонкам, 0..1
  cool: number; // среднее остывание за шаг (в единицах тепла): язык ~ HEAT_MAX / cool строк
  on: boolean;
  seed: number; // состояние ГСЧ
  acc: number; // накопленное время до следующего шага
  n: number; // номер шага
}

// mulberry32: детерминированный ГСЧ, состояние — в поле.
function rand(f: HeatField): number {
  f.seed = (f.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(f.seed ^ (f.seed >>> 15), 1 | f.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const ease = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y), u = ease(x - i), v = ease(y - j);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function createHeat(w: number, h: number, cool: number, bed?: number[], seed = 1): HeatField {
  return { w, h, heat: new Float32Array(w * h), bed: Float32Array.from(bed ?? new Array(w).fill(1)), cool, on: true, seed, acc: 0, n: 0 };
}

function step(f: HeatField): void {
  const { w, h, heat } = f;
  f.n++;
  const base = (h - 1) * w;
  for (let x = 0; x < w; x++) heat[base + x] = f.on ? HEAT_MAX * f.bed[x] : 0;
  // Колонки остывают по-разному и это «гуляет» во времени — огонь стоит отдельными языками.
  for (let y = 1; y < h; y++) {
    // Погашенный очаг: строку-приёмник чистим, иначе не тронутые разбросом клетки хранят старый жар.
    if (!f.on) heat.fill(0, (y - 1) * w, y * w);
    const flip = (y + f.n) & 1; // чередуем направление прохода, чтобы не было «ветра»
    for (let i = 0; i < w; i++) {
      const x = flip ? w - 1 - i : i;
      const r = rand(f);
      const to = x + (r < 0.3 ? -1 : r > 0.7 ? 1 : 0);
      if (to < 0 || to >= w) continue;
      const tongue = 0.6 + 0.8 * noise(x / 4, f.n / DRIFT);
      const v = heat[y * w + x] - rand(f) * 2 * f.cool * tongue;
      heat[(y - 1) * w + to] = v > 0 ? v : 0;
    }
  }
}

export function stepHeat(f: HeatField, dt: number): void {
  f.acc += Math.min(Math.max(dt, 0), 0.25);
  while (f.acc >= 1 / HEAT_RATE - 1e-6) {
    step(f);
    f.acc -= 1 / HEAT_RATE;
  }
}

export function heatLevel(f: HeatField, x: number, y: number): number {
  const v = (f.heat[y * f.w + x] / HEAT_MAX - FLOOR) / (1 - FLOOR);
  return v <= 0 ? 0 : Math.min(HEAT_RAMP.length - 1, 1 + ((v * (HEAT_RAMP.length - 1)) | 0));
}
