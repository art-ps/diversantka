import { currentPose } from '../anim/animator';
import { CLIPS } from '../anim/clips';
import { NINA, ROOM_H, ROOM_W } from '../config';
import { TRANSITION_TIME, type Game } from '../game';
import type { Room } from '../world/room';
import { drawFigure } from './figure';
import type { Color, GlyphBatch } from './glyphs';
import { PAL } from './palette';

const WALL_GLYPHS = '#%&8';
const hash = (c: number, r: number) => ((c * 73856093) ^ (r * 19349663)) >>> 0;
const dim = (c: Color, k: number): Color => [c[0] * k, c[1] * k, c[2] * k, c[3]];

const SUB = 0.5; // мелкий символ — полклетки
// Символ размера SUB с центром в подклетке (i, j) клетки (x, y).
const sub = (b: Pick<GlyphBatch, 'push'>, x: number, y: number, i: number, j: number, ch: string, c: Color) =>
  b.push(x + 0.25 + i / 2 - 0.5, y + 0.25 + j / 2 - 0.5, ch, c, SUB);

function isWall(room: Room, c: number, r: number) {
  const t = room.tiles[r]?.[c];
  return t === '#' || t === 'S';
}

// Клетки строки 0 под HUD (с полем в одну клетку) комната не рисует: свечение складывается, подложки нет.
const CREDIT = 'движения: mocap.cs.cmu.edu';

export const hudCell = (x: number, y: number, hudId: string, time: number) =>
  (Math.round(y) === 0 && (Math.round(x) <= 19 || Math.round(x) >= ROOM_W - hudId.length - 2)) ||
  (time < 8 && Math.round(y) === ROOM_H - 1 && Math.round(x) >= ROOM_W - CREDIT.length - 1);

export function drawRoom(b: Pick<GlyphBatch, 'push'>, room: Room, ox: number, oy: number, time: number, hudId: string): void {
  for (let r = 0; r < ROOM_H; r++) {
    for (let c = 0; c < ROOM_W; c++) {
      const x = c + ox, y = r + oy;
      if (hudCell(x, y, hudId, time)) continue;
      const t = room.tiles[r][c];
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 2; i++) {
          const h = hash(2 * c + i, 2 * r + j);
          if (t === '.') {
            // Дышащая фоновая сетка: редкие тусклые точки.
            if (h % 9 === 0) sub(b, x, y, i, j, h % 3 ? '·' : ':', dim(PAL.grid, 0.6 + 0.4 * Math.sin(time * 0.8 + (h % 100))));
          } else if (t === '#' || t === 'S') {
            // Подклетка на открытой стороне — яркая кромка, внутри — тусклее.
            const edge = (i === 0 && !isWall(room, c - 1, r)) || (i === 1 && !isWall(room, c + 1, r))
              || (j === 0 && !isWall(room, c, r - 1)) || (j === 1 && !isWall(room, c, r + 1));
            sub(b, x, y, i, j, WALL_GLYPHS[h % WALL_GLYPHS.length], t === 'S' ? PAL.fake : edge ? PAL.wall : PAL.wallInner);
          } else if (t === '=') {
            if (j === 0) sub(b, x, y, i, j, '=', PAL.platform);
          } else if (t === 'H') {
            sub(b, x, y, i, j, '|', PAL.ladder);
          } else if (t === '~') {
            sub(b, x, y, i, j, '~', dim(PAL.water, 0.7 + 0.3 * Math.sin(time * 3 + 2 * c + i)));
          } else if (t === '^') {
            if (j === 1) sub(b, x, y, i, j, '^', dim(PAL.hazard, 0.7 + 0.3 * Math.sin(time * 9 + 2 * c + i)));
          }
        }
      }
      // Перекладина лестницы — посередине клетки, между рельсами.
      if (t === 'H') b.push(x, y, '-', PAL.ladder, SUB);
    }
  }
}

function drawNina(b: GlyphBatch, g: Game, ox: number, oy: number): void {
  const { body, facing } = g.nina;
  drawFigure(b, currentPose(g.anim, CLIPS), body.x + body.w / 2 + ox, body.y + body.h + oy, facing, PAL.nina, g.nina.state === 'ladder');
}

function drawHud(b: GlyphBatch, g: Game, time: number): void {
  const filled = Math.round((g.nina.energy / NINA.energyMax) * 10);
  b.text(1, 0, 'ЭНЕРГИЯ ', PAL.hud);
  b.text(9, 0, '█'.repeat(filled), g.nina.energy < NINA.lowEnergy ? PAL.danger : PAL.hud);
  b.text(9 + filled, 0, '░'.repeat(10 - filled), PAL.hudDim);
  b.text(ROOM_W - g.roomId.length - 1, 0, g.roomId, PAL.hudDim);
  if (g.nina.dead) b.text(9, 12, 'ПОГИБЛА · ПРЫЖОК — ЗАНОВО', PAL.danger);
  if (time < 8) b.text(ROOM_W - CREDIT.length, ROOM_H - 1, CREDIT, PAL.hudDim);
}

export function drawGame(b: GlyphBatch, g: Game, time: number): void {
  const cur = g.rooms.get(g.roomId)!;
  if (g.transition) {
    const p = Math.min(1, g.transition.t / TRANSITION_TIME);
    const e = p * p * (3 - 2 * p);
    const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[g.transition.dir];
    const ox = v[0] * ROOM_W * (1 - e), oy = v[1] * ROOM_H * (1 - e);
    drawRoom(b, g.rooms.get(g.transition.from)!, ox - v[0] * ROOM_W, oy - v[1] * ROOM_H, time, g.roomId);
    drawRoom(b, cur, ox, oy, time, g.roomId);
    drawNina(b, g, ox, oy);
  } else {
    drawRoom(b, cur, 0, 0, time, g.roomId);
    drawNina(b, g, 0, 0);
  }
  drawHud(b, g, time);
}
