import { NINA, ROOM_H, ROOM_W } from '../config';
import { TRANSITION_TIME, type Game } from '../game';
import type { Room } from '../world/room';
import type { Color, GlyphBatch } from './glyphs';
import { PAL } from './palette';

const WALL_GLYPHS = '#%&8';
const hash = (c: number, r: number) => ((c * 73856093) ^ (r * 19349663)) >>> 0;
const dim = (c: Color, k: number): Color => [c[0] * k, c[1] * k, c[2] * k, c[3]];

function isWall(room: Room, c: number, r: number) {
  const t = room.tiles[r]?.[c];
  return t === '#' || t === 'S';
}

export function drawRoom(b: GlyphBatch, room: Room, ox: number, oy: number, time: number): void {
  for (let r = 0; r < ROOM_H; r++) {
    for (let c = 0; c < ROOM_W; c++) {
      const t = room.tiles[r][c];
      const x = c + ox, y = r + oy;
      const h = hash(c, r);
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

// ponytail: заглушка героини — прямоугольник из символов; скелет — план 2.
function drawNina(b: GlyphBatch, g: Game, ox: number, oy: number): void {
  const { body, crouching } = g.nina;
  const cols = Math.max(1, Math.round(body.w));
  const rows = Math.round(body.h);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = r === 0 ? 'O' : crouching ? '%' : r === rows - 1 ? (c === 0 ? '/' : '\\') : '#';
      b.push(body.x + ox + c * (body.w / cols) - 0.2, body.y + oy + r * (body.h / rows), ch, PAL.nina);
    }
  }
}

function drawHud(b: GlyphBatch, g: Game): void {
  const filled = Math.round((g.nina.energy / NINA.energyMax) * 10);
  b.text(1, 0, 'ЭНЕРГИЯ ', PAL.hud);
  b.text(9, 0, '█'.repeat(filled), g.nina.energy < 25 ? PAL.danger : PAL.hud);
  b.text(9 + filled, 0, '░'.repeat(10 - filled), PAL.hudDim);
  b.text(ROOM_W - g.roomId.length - 1, 0, g.roomId, PAL.hudDim);
  if (g.nina.dead) b.text(9, 12, 'ПОГИБЛА · ПРЫЖОК — ЗАНОВО', PAL.danger);
}

export function drawGame(b: GlyphBatch, g: Game, time: number): void {
  const cur = g.rooms.get(g.roomId)!;
  if (g.transition) {
    const p = Math.min(1, g.transition.t / TRANSITION_TIME);
    const e = p * p * (3 - 2 * p);
    const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[g.transition.dir];
    const ox = v[0] * ROOM_W * (1 - e), oy = v[1] * ROOM_H * (1 - e);
    drawRoom(b, g.rooms.get(g.transition.from)!, ox - v[0] * ROOM_W, oy - v[1] * ROOM_H, time);
    drawRoom(b, cur, ox, oy, time);
    drawNina(b, g, ox, oy);
  } else {
    drawRoom(b, cur, 0, 0, time);
    drawNina(b, g, 0, 0);
  }
  drawHud(b, g);
}
