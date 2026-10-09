import { currentPose } from '../anim/animator';
import { CLIPS } from '../anim/clips';
import { J } from '../anim/clip';
import { dogGlyphs } from '../anim/dog';
import { simplePose } from '../anim/simple';
import { FX, MISSION, NINA, ROOM_H, ROOM_W } from '../config';
import { TRANSITION_TIME, type Game } from '../game';
import { fireCells, heatColor, type Fire } from '../fx/fires';
import { HEAT_RAMP } from '../fx/heat';
import { flamerPhase } from '../sim/flamer';
import { formatTime, missionResult } from '../sim/mission';
import { floaterView, type Floater } from '../sim/floaters';
import type { Item, Projectile } from '../sim/items';
import { particleAlpha, type Particle } from '../sim/particles';
import type { Room } from '../world/room';
import type { Point, TerminalSpawn } from '../world/spawns';
import { drawFigure } from './figure';
import type { Color, GlyphBatch } from './glyphs';
import { PAL } from './palette';
import { drawFailed, drawOutro, drawResult, drawScreen } from './screens';

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

const HUD_STEP = 0.6; // шаг символов HUD — буквы уже клетки
export const hudWidth = (s: string) => s.length * HUD_STEP;
const ENERGY_LABEL = 'ЭНЕРГИЯ ';
const LEFT_END = 1 + hudWidth(ENERGY_LABEL) + 10 * HUD_STEP;
const MID_HALF = Math.ceil(hudWidth('ЛЕНТЫ 0/6 · 00:00') / 2); // ленты и таймер — по центру строки 0

export const hudCell = (x: number, y: number, hudId: string, time: number) =>
  (Math.round(y) === 0 &&
    (Math.round(x) <= Math.ceil(LEFT_END) || Math.abs(Math.round(x) - ROOM_W / 2) <= MID_HALF ||
      Math.round(x) >= Math.floor(ROOM_W - 1 - hudWidth(hudId)) - 1)) ||
  (time < 8 && Math.round(y) === ROOM_H - 1 && Math.round(x) >= Math.floor(ROOM_W - 0.5 - hudWidth(CREDIT)) - 1);

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
            // Рябь (по мотивам pond-ripples из ascii.rest): волна бежит вдоль воды, на гребне — блик.
            const w = Math.sin(time * 3 - (2 * c + i) * 0.9 + (2 * r + j) * 1.3);
            sub(b, x, y, i, j, w > 0.3 ? '~' : w > -0.5 ? '-' : '.', dim(PAL.water, w > 0.85 ? 1 : 0.55 + 0.25 * (w + 1) / 2));
          }
        }
      }
      // Перекладина лестницы — посередине клетки, между рельсами.
      if (t === 'H') b.push(x, y, '-', PAL.ladder, SUB);
    }
  }
}

const ITEM_GLYPH = { knife: '/', stone: 'o', wrench: 'Y' } as const;

export function drawItems(b: Pick<GlyphBatch, 'push'>, items: Item[], ox: number, oy: number): void {
  for (const i of items) b.push(i.x + ox - 0.5, i.bottom - 0.25 + oy - 0.5, ITEM_GLYPH[i.kind], PAL.item, 0.5);
}

// Терминал: экран над тумбой; главная ЭВМ — втрое шире.
export function drawTerminals(b: Pick<GlyphBatch, 'push'>, ts: TerminalSpawn[], ox: number, oy: number): void {
  for (const t of ts) {
    const w = t.main ? 3 : 1;
    for (let i = 0; i < w; i++) {
      const x = t.x - (w - 1) / 2 + i - 0.5 + ox;
      b.push(x, t.bottom - 2 + oy, '▒', PAL.hud);
      b.push(x, t.bottom - 1 + oy, '█', PAL.wallInner);
    }
  }
}

// Щиток (горит красным, пока забор под током), мотоцикл, забор.
export function drawFenceParts(b: Pick<GlyphBatch, 'push'>, g: Game, ox: number, oy: number, time: number): void {
  const on = !g.mission.fenceOff;
  if (g.panel) b.push(g.panel.x - 0.5 + ox, g.panel.bottom - 2.5 + oy, '▓', on ? PAL.danger : PAL.hud);
  if (g.bike) {
    const { x, bottom } = g.bike;
    b.push(x - 1.5 + ox, bottom - 1 + oy, 'o', PAL.item);
    b.push(x - 0.5 + ox, bottom - 1 + oy, '=', PAL.item);
    b.push(x + 0.5 + ox, bottom - 1 + oy, 'o', PAL.item);
    b.push(x + 0.5 + ox, bottom - 2 + oy, '/', PAL.item);
  }
  if (g.fence) {
    for (let y = g.fence.top; y <= g.fence.bottom; y++) {
      const flick = on && Math.floor(time * 15 + y * 7) % 3 === 0;
      b.push(g.fence.x + ox, y + oy, y === g.fence.top ? '+' : '|', on ? (flick ? PAL.fireHot : PAL.danger) : PAL.hudDim);
    }
  }
}

// Перфолента — мелкий блок своего цвета.
export function drawTapes(b: Pick<GlyphBatch, 'push'>, tapes: Point[], ox: number, oy: number): void {
  for (const t of tapes) b.push(t.x + ox - 0.5, t.bottom - 0.25 + oy - 0.5, '▓', PAL.tape, 0.5);
}

export function drawProjectiles(b: Pick<GlyphBatch, 'push'>, ps: Projectile[], ox: number, oy: number): void {
  for (const p of ps) {
    if (!p.alive) continue;
    const ch = p.kind === 'knife' ? (Math.abs(p.vy) > Math.abs(p.vx) * 0.3 ? (p.vy * p.vx > 0 ? '\\' : '/') : '-') : ITEM_GLYPH[p.kind];
    b.push(p.x + ox - 0.5, p.y + oy - 0.5, ch, PAL.projectile, 0.5);
  }
}

export function drawParticles(b: Pick<GlyphBatch, 'push'>, ps: Particle[], ox: number, oy: number): void {
  for (const p of ps) {
    const k = particleAlpha(p);
    b.push(p.x - 0.5 + ox, p.y - 0.5 + oy, p.ch, [p.color[0], p.color[1], p.color[2], p.color[3] * k], p.size);
  }
}

// Мигание при неуязвимости: фигура видна через кадр.
const blinkOff = (invulnT: number, time: number) => invulnT > 0 && Math.floor(time * 12) % 2 !== 0;

function drawAndroids(b: GlyphBatch, g: Game, ox: number, oy: number, time: number): void {
  for (const a of g.androids) {
    if (a.gone) continue;
    if (a.state !== 'dead' && blinkOff(a.invulnT, time)) continue;
    drawFigure(b, simplePose(a.anim, CLIPS), a.body.x + a.body.w / 2 + ox, a.body.y + a.body.h + oy, a.facing, PAL.android, false, '@');
  }
}

function drawDogs(b: GlyphBatch, g: Game, ox: number, oy: number): void {
  for (const d of g.dogs) {
    if (d.gone) continue;
    for (const s of dogGlyphs(d, PAL.dog)) b.push(s.x - 0.5 + ox, s.y - 0.5 + oy, s.ch, s.color, s.size);
  }
}

function drawNina(b: GlyphBatch, g: Game, ox: number, oy: number, time: number): void {
  const { body, facing } = g.nina;
  if (!g.nina.dead && blinkOff(g.nina.invulnT, time)) return;
  const pose = currentPose(g.anim, CLIPS);
  const x = body.x + body.w / 2 + ox, y = body.y + body.h + oy;
  drawFigure(b, pose, x, y, facing, PAL.nina, g.nina.state === 'ladder');
  if (g.nina.held) b.push(x + facing * pose[2 * J.rHand] - 0.5, y - pose[2 * J.rHand + 1] - 0.5, ITEM_GLYPH[g.nina.held], PAL.item, 0.5);
}

const FLOAT_COLOR = { damage: PAL.danger, enemy: PAL.item, blocked: PAL.hudDim } as const;
const FLOAT_SIZE = 0.7; // числа чуть мельче обычного текста
const FLOAT_STEP = 0.6 * FLOAT_SIZE; // шаг между символами числа — цифры уже клетки

export function drawFloaters(b: Pick<GlyphBatch, 'push'>, list: Floater[], ox: number, oy: number): void {
  for (const f of list) {
    const v = floaterView(f);
    const c = FLOAT_COLOR[f.kind];
    const color: Color = [c[0], c[1], c[2], c[3] * v.alpha];
    const w = f.text.length * FLOAT_STEP;
    [...f.text].forEach((ch, i) => b.push(v.x - w / 2 + i * FLOAT_STEP + FLOAT_STEP / 2 - 0.5 + ox, v.y - 0.5 + oy, ch, color, FLOAT_SIZE));
  }
}

const SNOW = ' .:░▒';

// Перемешивание для снега: у линейного hash видны повторяющиеся узоры.
const mix = (h: number) => {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

// Помехи старого телевизора (по мотивам tv-static из ascii.rest): снег по полклеткам и бегущая светлая полоса.
export function drawStatic(b: Pick<GlyphBatch, 'push'>, deadT: number, time: number): void {
  const k = Math.min(1, deadT / FX.staticIn);
  if (k <= 0) return;
  const frame = Math.floor(time * 20);
  for (let r = 0; r < ROOM_H * 2; r++) {
    const bar = ((r / (ROOM_H * 2) - time * 0.3) % 1 + 1) % 1 < 0.08;
    for (let c = 0; c < ROOM_W * 2; c++) {
      const h = mix(hash(c + frame * 131, r + frame * 71));
      if ((h % 1000) / 1000 >= k * FX.staticDensity * (bar ? 1.6 : 1)) continue;
      const ch = SNOW[1 + ((h >>> 10) % (SNOW.length - 1))];
      const a = PAL.static[3] * k * (bar ? 1.8 : 1);
      b.push(c / 2 + 0.25 - 0.5, r / 2 + 0.25 - 0.5, ch, [PAL.static[0], PAL.static[1], PAL.static[2], a], 0.5);
    }
  }
}

function drawHud(b: GlyphBatch, g: Game, time: number): void {
  const filled = Math.round((g.nina.energy / NINA.energyMax) * 10);
  const barX = 1 + hudWidth(ENERGY_LABEL);
  b.text(1, 0, ENERGY_LABEL, PAL.hud, HUD_STEP);
  b.text(barX, 0, '█'.repeat(filled), g.nina.energy < NINA.lowEnergy ? PAL.danger : PAL.hud, HUD_STEP);
  b.text(barX + hudWidth('█'.repeat(filled)), 0, '░'.repeat(10 - filled), PAL.hudDim, HUD_STEP);
  b.text(ROOM_W - 1 - hudWidth(g.roomId), 0, g.roomId, PAL.hudDim, HUD_STEP);
  const tapes = `ЛЕНТЫ ${g.mission.tapes.size}/${MISSION.tapes} · `;
  const clock = formatTime(g.mission.timeLeft);
  const mx = (ROOM_W - hudWidth(tapes + clock)) / 2;
  b.text(mx, 0, tapes, PAL.hud, HUD_STEP);
  b.text(mx + hudWidth(tapes), 0, clock, g.mission.timeLeft < MISSION.lowTime ? PAL.danger : PAL.hud, HUD_STEP);
  if (g.nina.dead && !g.mission.result) {
    const msg = 'ПОГИБЛА · ПРЫЖОК — ЗАНОВО';
    b.text((ROOM_W - hudWidth(msg)) / 2, 12, msg, PAL.danger, HUD_STEP);
  }
  if (time < 8) b.text(ROOM_W - 0.5 - hudWidth(CREDIT), ROOM_H - 1, CREDIT, PAL.hudDim, HUD_STEP);
}

function drawFlamers(b: GlyphBatch, g: Game, ox: number, oy: number): void {
  for (const f of g.flamers) {
    const hot = flamerPhase(f) !== 'off';
    b.push(f.x - 0.5 + ox - (f.dir > 0 ? 0.5 : -0.5), f.y - 0.5 + oy, f.dir > 0 ? '>' : '<', hot ? PAL.fireHot : PAL.wall, 0.8);
  }
}

export function drawFires(b: Pick<GlyphBatch, 'push'>, fires: Fire[], ox: number, oy: number): void {
  for (const fire of fires) for (const c of fireCells(fire)) b.push(c.x - 0.5 + ox, c.y - 0.5 + oy, HEAT_RAMP[c.level], heatColor(c.level), 0.5);
}

// Всё, что живёт в комнате поверх тайлов; ox, oy — сдвиг перехода.
function drawWorld(b: GlyphBatch, g: Game, ox: number, oy: number, time: number): void {
  drawFires(b, g.fires, ox, oy);
  drawFlamers(b, g, ox, oy);
  drawTerminals(b, g.terminals, ox, oy);
  drawFenceParts(b, g, ox, oy, time);
  drawItems(b, g.items, ox, oy);
  drawTapes(b, g.tapes, ox, oy);
  drawAndroids(b, g, ox, oy, time);
  drawDogs(b, g, ox, oy);
  drawProjectiles(b, g.projectiles, ox, oy);
  drawParticles(b, g.particles, ox, oy);
  drawNina(b, g, ox, oy, time);
  drawFloaters(b, g.floaters, ox, oy);
}

export function drawGame(b: GlyphBatch, g: Game, time: number): void {
  if (g.mission.result === 'won') {
    if (g.endT < MISSION.outroTime) drawOutro(b, g.endT);
    else drawResult(b, missionResult(g.mission), g.copied);
    return;
  }
  if (g.screen) {
    // Экран ЭВМ на весь кадр: при сложении яркостей мир под рамкой мешал бы читать.
    drawScreen(b, g.screen);
    drawHud(b, g, time);
    return;
  }
  const cur = g.rooms.get(g.roomId)!;
  if (g.transition) {
    const p = Math.min(1, g.transition.t / TRANSITION_TIME);
    const e = p * p * (3 - 2 * p);
    const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[g.transition.dir];
    const ox = v[0] * ROOM_W * (1 - e), oy = v[1] * ROOM_H * (1 - e);
    drawRoom(b, g.rooms.get(g.transition.from)!, ox - v[0] * ROOM_W, oy - v[1] * ROOM_H, time, g.roomId);
    drawRoom(b, cur, ox, oy, time, g.roomId);
    drawWorld(b, g, ox, oy, time);
  } else {
    drawRoom(b, cur, 0, 0, time, g.roomId);
    drawWorld(b, g, 0, 0, time);
  }
  const failed = g.mission.result === 'failed';
  if (g.nina.dead || failed) drawStatic(b, failed ? FX.staticIn : g.nina.deadT, time);
  drawHud(b, g, time);
  if (failed) drawFailed(b);
}
