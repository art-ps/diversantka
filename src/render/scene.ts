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

function isWall(room: Room, c: number, r: number) {
  const t = room.tiles[r]?.[c];
  return t === '#' || t === 'S';
}

// Клетки строки 0 под HUD (с полем в одну клетку) комната не рисует: свечение складывается, подложки нет.
export const hudCell = (x: number, y: number, hudId: string, time: number) =>
  (Math.round(y) === 0 && (Math.round(x) <= 19 || Math.round(x) >= ROOM_W - hudId.length - 2)) ||
  (time < 8 && Math.round(y) === ROOM_H - 1 && Math.round(x) >= ROOM_W - 27);

export function drawRoom(b: GlyphBatch, room: Room, ox: number, oy: number, time: number, hudId: string): void {
  for (let r = 0; r < ROOM_H; r++) {
    for (let c = 0; c < ROOM_W; c++) {
      const t = room.tiles[r][c];
      const x = c + ox, y = r + oy;
      const h = hash(c, r);
      if (hudCell(x, y, hudId, time)) continue;
      if (t === '.') {
        // Дышащая фоновая сетка: редкие тусклые символы.
        if (h % 7 === 0) {
          const k = 0.6 + 0.4 * Math.sin(time * 0.8 + (h % 100));
          b.push(x, y, h % 3 ? '·' : ':', dim(PAL.grid, k));
        }
        continue;
      }
      if (t === '#' || t === 'S') {
        const edge = !isWall(room, c - 1, r) || !isWall(room, c + 1, r) || !isWall(room, c, r - 1) || !isWall(room, c, r + 1);
        const base = t === 'S' ? PAL.fake : edge ? PAL.wall : PAL.wallInner;
        b.push(x, y, WALL_GLYPHS[h % WALL_GLYPHS.length], base);
      } else if (t === '=') b.push(x, y, '=', PAL.platform);
      else if (t === 'H') b.push(x, y, 'H', PAL.ladder);
      else if (t === '~') b.push(x, y, '~', dim(PAL.water, 0.7 + 0.3 * Math.sin(time * 3 + c)));
      else if (t === '^') b.push(x, y, '^', dim(PAL.hazard, 0.7 + 0.3 * Math.sin(time * 9 + c * 2)));
    }
  }
}

function drawNina(b: GlyphBatch, g: Game, ox: number, oy: number): void {
  const { body, facing } = g.nina;
  drawFigure(b, currentPose(g.anim, CLIPS), body.x + body.w / 2 + ox, body.y + body.h + oy, facing, PAL.nina);
}

function drawHud(b: GlyphBatch, g: Game, time: number): void {
  const filled = Math.round((g.nina.energy / NINA.energyMax) * 10);
  b.text(1, 0, 'ЭНЕРГИЯ ', PAL.hud);
  b.text(9, 0, '█'.repeat(filled), g.nina.energy < NINA.lowEnergy ? PAL.danger : PAL.hud);
  b.text(9 + filled, 0, '░'.repeat(10 - filled), PAL.hudDim);
  b.text(ROOM_W - g.roomId.length - 1, 0, g.roomId, PAL.hudDim);
  if (g.nina.dead) b.text(9, 12, 'ПОГИБЛА · ПРЫЖОК — ЗАНОВО', PAL.danger);
  if (time < 8) b.text(ROOM_W - 26, ROOM_H - 1, 'движения: mocap.cs.cmu.edu', PAL.hudDim);
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
