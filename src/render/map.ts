import { ROOM_W } from '../config';
import type { Game } from '../game';
import { layoutMap, mapIcons, type MapIcon } from '../world/map';
import type { Color, GlyphBatch } from './glyphs';
import { PAL } from './palette';

// Область карты (клетки, включительно) и шаг комнат: блок 2×1 клетки и зазор в клетку под связь.
export const MAP_AREA = { x0: 1, x1: 38, y0: 4, y1: 20 };
export const MAP_PX = 3, MAP_PY = 2;
const STEP = 0.6; // шаг букв, как в HUD
const SLOTS = 4; // значков в блоке комнаты — верхний ряд полклеток

const ICON: Record<MapIcon, { ch: string; color: Color }> = {
  terminal: { ch: 'Т', color: PAL.hud },
  main: { ch: 'Э', color: PAL.item },
  switch: { ch: 'Щ', color: PAL.hud },
  bike: { ch: 'Г', color: PAL.item },
  tape: { ch: '▓', color: PAL.tape },
};
export const MAP_TITLE = 'ПАУЗА · КАРТА';
export const MAP_LEGEND = 'Т ТЕРМИНАЛ  Э ЭВМ  Щ ЩИТОК  Г ГАРАЖ  ▓ ЛЕНТА';
export const MAP_HINT = 'ESC/START — ПРОДОЛЖИТЬ · M — ЗВУК';

const centered = (b: Pick<GlyphBatch, 'text'>, y: number, s: string, c: Color) => b.text((ROOM_W - s.length * STEP) / 2, y, s, c, STEP);

// Пауза: открытые комнаты по раскладке из выходов, связи между ними, текущая мигает; значки в блоках.
export function drawMap(b: Pick<GlyphBatch, 'push' | 'text'>, g: Game, time: number): void {
  centered(b, 2, MAP_TITLE, PAL.hud);
  const { pos } = layoutMap(g.rooms, g.start.room);
  const seen = [...g.seen].filter(id => pos.has(id));
  if (seen.length) {
    const xs = seen.map(id => pos.get(id)!.x), ys = seen.map(id => pos.get(id)!.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = (Math.max(...xs) - minX) * MAP_PX + 2, h = (Math.max(...ys) - minY) * MAP_PY + 1;
    const ox = Math.floor((MAP_AREA.x0 + MAP_AREA.x1 + 1 - w) / 2) - minX * MAP_PX;
    const oy = Math.floor((MAP_AREA.y0 + MAP_AREA.y1 + 1 - h) / 2) - minY * MAP_PY;
    const blink = Math.floor(time * 3) % 2 === 0;
    for (const id of seen) {
      const p = pos.get(id)!, room = g.rooms.get(id)!;
      const x = ox + p.x * MAP_PX, y = oy + p.y * MAP_PY;
      const right = room.exits.right, down = room.exits.down;
      if (right && g.seen.has(right) && pos.get(right)?.x === p.x + 1 && pos.get(right)?.y === p.y) b.push(x + 2, y, '-', PAL.hudDim);
      if (down && g.seen.has(down) && pos.get(down)?.x === p.x && pos.get(down)?.y === p.y + 1) b.push(x + 0.5, y + 1, '|', PAL.hudDim);
      const icons = mapIcons(room, g.mission.tapes).slice(0, SLOTS);
      const lit = id === g.roomId && blink;
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < SLOTS; i++) {
          const icon = j === 0 ? icons[i] : undefined;
          const gx = x + 0.25 + i / 2 - 0.5, gy = y + 0.25 + j / 2 - 0.5;
          if (icon) b.push(gx, gy, ICON[icon].ch, ICON[icon].color, 0.5);
          else b.push(gx, gy, lit ? '▓' : '░', lit ? PAL.hud : PAL.hudDim, 0.5);
        }
      }
    }
  }
  centered(b, 22, MAP_LEGEND, PAL.hudDim);
  centered(b, 23, MAP_HINT, PAL.hudDim);
}
