import { FIRE, FLAMER } from '../config';
import { PAL } from '../render/palette';
import type { Color } from '../render/glyphs';
import { flamerPhase, type Flamer } from '../sim/flamer';
import type { Room } from '../world/room';
import { createHeat, heatLevel, stepHeat, type HeatField } from './heat';

export interface Fire { field: HeatField; kind: 'pit' | 'jet'; x: number; y: number; dir: 1 | -1; flamer?: string }

// Огненные ямы: каждый непрерывный отрезок `^` в строке — одно поле жара.
export function pitFires(room: Room): Fire[] {
  const out: Fire[] = [];
  room.tiles.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '^') continue;
      let len = 1;
      while (row[c + len] === '^') len++;
      out.push({ field: createHeat(2 * len, 2 * (1 + FIRE.pitRise), FIRE.pitCool, undefined, 1 + r * 64 + c), kind: 'pit', x: c, y: r + 1, dir: 1 });
      c += len - 1;
    }
  });
  return out;
}

export const jetFire = (f: Flamer): Fire => ({
  field: createHeat(FIRE.jetWidth, 2 * FLAMER.length, FIRE.jetCool, [0.6, 1, 1, 0.6], 7),
  kind: 'jet', x: f.x, y: f.y, dir: f.dir, flamer: f.id,
});

export function stepFires(fires: Fire[], flamers: Flamer[], dt: number): void {
  for (const fire of fires) {
    if (fire.kind === 'jet') {
      const f = flamers.find(m => m.id === fire.flamer);
      fire.field.on = !!f && flamerPhase(f) === 'on';
    }
    stepHeat(fire.field, dt);
  }
}

// Центры полклеток с огнём, в клетках мира.
export function fireCells(fire: Fire): { x: number; y: number; level: number }[] {
  const { field: f } = fire;
  const out: { x: number; y: number; level: number }[] = [];
  for (let j = 0; j < f.h; j++) {
    for (let i = 0; i < f.w; i++) {
      const level = heatLevel(f, i, j);
      if (!level) continue;
      if (fire.kind === 'pit') {
        out.push({ x: fire.x + (i + 0.5) / 2, y: fire.y - (f.h - 1 - j + 0.5) / 2, level });
      } else {
        const d = (f.h - 1 - j + 0.5) / 2, a = (i + 0.5) / 2 - f.w / 4;
        out.push({ x: fire.x + fire.dir * d, y: fire.y + a - FIRE.jetLift * d, level });
      }
    }
  }
  return out;
}

const WHITE: Color = [1, 0.97, 0.88, 1];
export function heatColor(k: number): Color {
  if (k <= 3) { const s = 0.35 + 0.15 * k; return [PAL.hazard[0] * s, PAL.hazard[1] * s, PAL.hazard[2] * s, 1]; }
  return k <= 6 ? PAL.fire : k <= 8 ? PAL.fireHot : WHITE;
}
