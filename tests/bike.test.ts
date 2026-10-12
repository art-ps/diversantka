import { describe, expect, it } from 'vitest';
import { CLIPS } from '../src/anim/clips';
import { J } from '../src/anim/clip';
import { BIKE, MISSION } from '../src/config';
import { CHARSET } from '../src/render/atlas';
import { BIKE_ART, BIKE_BAR, BIKE_H, BIKE_SEAT, BIKE_W, bikeGlyphs, ridePose, riderGlyphs, spokeGlyph } from '../src/render/bike';
import { drawFenceParts } from '../src/render/scene';
import { drawOutro, OUTRO_ROAD, outroBikeX, outroSmoke } from '../src/render/screens';
import { createGame } from '../src/game';
import { tileAt } from '../src/world/room';
import { parseFence } from '../src/world/spawns';
import { loadRoomsFs } from './helpers';

const crouch = CLIPS.get('crouch')!.frames;
const RIDER = ridePose(crouch[crouch.length - 1]);
const E = 1e-9;

describe('рисунок мотоцикла', () => {
  it('строки одной длины; символы — из атласа', () => {
    for (const row of BIKE_ART) expect(row.length).toBe(BIKE_ART[0].length);
    for (const g of bikeGlyphs(10, 20, 0)) expect(CHARSET).toContain(g.ch);
    for (const d of [0, 0.3, 0.6, 0.9, 1.2]) expect('-\\|/').toContain(spokeGlyph(d));
  });

  it('~5 клеток длиной и 3 высотой; стоит на bottom, ниже пола ничего', () => {
    expect(BIKE_W).toBeGreaterThan(4.5);
    expect(BIKE_W).toBeLessThan(6);
    expect(BIKE_H).toBe(3);
    const gs = bikeGlyphs(10, 20, 0);
    for (const g of gs) {
      expect(g.size).toBe(0.5);
      expect(g.y + g.size / 2).toBeLessThanOrEqual(20 + E);
      expect(g.y - g.size / 2).toBeGreaterThanOrEqual(20 - BIKE_H - E);
      expect(Math.abs(g.x - 10)).toBeLessThanOrEqual(BIKE_W / 2);
    }
    expect(Math.max(...gs.map(g => g.y + g.size / 2))).toBeCloseTo(20); // колёса касаются пола
  });

  it('спицы меняют символ по мере пути, остальное — нет', () => {
    const a = bikeGlyphs(10, 20, 0), b = bikeGlyphs(10, 20, 0.7);
    const diff = a.filter((g, i) => g.ch !== b[i].ch);
    expect(diff).toHaveLength(2);
    expect(new Set([0, 0.6, 1.2, 1.8].map(spokeGlyph)).size).toBe(4);
  });

  it('колёса тусклее рамы', () => {
    const gs = bikeGlyphs(10, 20, 0);
    const lowest = gs.filter(g => g.y > 19.5);
    const top = gs.filter(g => g.y < 18);
    expect(lowest[0].color[0]).toBeLessThan(top[0].color[0]);
  });
});

describe('Нина в седле', () => {
  it('таз на сиденье, кисти на руле, вся фигура над полом', () => {
    const gs = riderGlyphs(10, 20, RIDER);
    for (const g of gs) {
      expect(CHARSET).toContain(g.ch);
      expect(g.y + g.size / 2).toBeLessThanOrEqual(20 + E);
    }
    const px = RIDER[2 * J.pelvis], py = RIDER[2 * J.pelvis + 1];
    for (const h of [J.lHand, J.rHand]) {
      expect(RIDER[2 * h] - px).toBeCloseTo(BIKE_BAR.dx - BIKE_SEAT.dx);
      expect(RIDER[2 * h + 1] - py).toBeCloseTo(BIKE_SEAT.dy - BIKE_BAR.dy);
    }
    const head = gs.find(g => g.ch === 'O')!;
    expect(head.x).toBeGreaterThan(10 + BIKE_SEAT.dx); // наклонилась вперёд, к рулю
    expect(head.y).toBeLessThan(20 - BIKE_H);
  });
});

describe('сцена выезда', () => {
  type P = { x: number; y: number; ch: string };
  const shot = (t: number) => {
    const out: P[] = [];
    drawOutro({ push: (x, y, ch) => { out.push({ x: x + 0.5, y: y + 0.5, ch }); } }, t, RIDER);
    return out;
  };

  it('Нина едет вместе с мотоциклом: голова над сиденьем при любом t', () => {
    for (const t of [0, 0.5, 1.5, 2.5]) {
      const head = shot(t).find(p => p.ch === 'O')!;
      const lamp = shot(t).find(p => p.ch === '<')!;
      expect(lamp.x - head.x, `t=${t}`).toBeCloseTo(shot(0).find(p => p.ch === '<')!.x - shot(0).find(p => p.ch === 'O')!.x);
      expect(head.x - outroBikeX(t), `t=${t}`).toBeCloseTo(shot(0).find(p => p.ch === 'O')!.x - outroBikeX(0));
    }
  });

  it('колёса крутятся: спицы на разных кадрах разные', () => {
    const spokes = new Set([0.6, 0.9, 1.2, 1.5, 1.8].map(t => spokeGlyph(outroBikeX(t) - outroBikeX(0))));
    expect(spokes.size).toBeGreaterThan(1);
  });

  it('из глушителя идёт дым: появляется, поднимается и тает', () => {
    expect(outroSmoke(0.5).length).toBeGreaterThan(3);
    const s = outroSmoke(1);
    for (const g of s) {
      expect('.,~').toContain(g.ch);
      expect(g.y).toBeLessThanOrEqual(OUTRO_ROAD + E);
      expect(g.color[3]).toBeGreaterThan(0);
    }
    expect(s.length).toBeLessThanOrEqual(Math.ceil(BIKE.smokeLife / BIKE.smokeEvery) + 1);
    expect(outroBikeX(MISSION.outroTime)).toBeGreaterThan(40 + BIKE_W / 2);
  });
});

it('гараж: мотоцикл стоит на полу, не в стене и не на лестнице; забор — во дворе, в проёме ворот', () => {
  const rooms = loadRoomsFs();
  const g = createGame(rooms, { room: 'garage-1', x: 4, bottom: 22 });
  expect(g.fence).toBeNull();
  const out: { x: number; y: number; s: number }[] = [];
  drawFenceParts({ push: (x, y, _ch, _c, s = 1) => { out.push({ x: x + 0.5, y: y + 0.5, s }); } }, { ...g, fence: null, panel: null }, 0, 0, 0);
  const room = rooms.get('garage-1')!;
  expect(out.length).toBe(bikeGlyphs(0, 0, 0).length);
  for (const p of out) {
    expect(tileAt(room, Math.floor(p.x), Math.floor(p.y)), `${p.x},${p.y}`).toBe('.');
    expect(p.y + p.s / 2).toBeLessThanOrEqual(g.bike!.bottom + E);
  }
  const yard = rooms.get('yard')!;
  const fence = parseFence(yard.meta.fence, 'yard')!;
  for (let r = fence.top; r <= fence.bottom; r++) {
    expect(tileAt(yard, fence.x, r), `забор ${r}`).toBe('.');
    expect(tileAt(yard, 0, r), `ворота ${r}`).toBe('.');
  }
  expect(tileAt(yard, fence.x, fence.bottom + 1)).toBe('#');
});
