import { describe, expect, it } from 'vitest';
import { DT, STORM } from '../src/config';
import { createPrologue, stepGame, type Game } from '../src/game';
import { flashAt, rainDrop, stormGlyphs, swellH } from '../src/fx/storm';
import { IDLE } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { PAL } from '../src/render/palette';
import { drawGame } from '../src/render/scene';
import { gliderAt, gliderRect, ROUTE } from '../src/sim/glider';
import { loadRoomsFs } from './helpers';

const rooms = loadRoomsFs();
const DARK = 1.0, BRIGHT = 2.44 + 0.1; // 1 с — темно; через 0,1 с после удара в 2,44 с — главный разряд

describe('вспышки молнии', () => {
  it('почти всё время темно, главный разряд — яркость 1, расписание повторяется', () => {
    expect(flashAt(DARK).lit).toBe(0);
    expect(flashAt(BRIGHT).lit).toBe(1);
    expect(flashAt(BRIGHT + STORM.flashLoop).lit).toBe(1);
    let dark = 0;
    for (let t = 0; t < STORM.flashLoop; t += 0.05) if (flashAt(t).lit < 0.05) dark++;
    expect(dark / (STORM.flashLoop / 0.05)).toBeGreaterThan(0.5);
  });

  it('вспышка подсвечивает горы и силуэт НИИ, рисует молнию', () => {
    const sea2 = rooms.get('sea-2')!;
    const light = (t: number) => stormGlyphs(sea2, t).filter(g => g.color[0] === PAL.storm[0] && g.ch !== '/' && g.ch !== ',').reduce((s, g) => s + g.color[3], 0);
    expect(light(BRIGHT)).toBeGreaterThan(2 * light(DARK));
    const bolt = (t: number) => stormGlyphs(sea2, t).filter(g => g.color[0] === PAL.foam[0] && '/\\|'.includes(g.ch));
    expect(bolt(DARK)).toHaveLength(0);
    expect(bolt(BRIGHT).length).toBeGreaterThan(5);
  });
});

describe('дождь и море', () => {
  it('дождь косой: капля падает вниз и влево', () => {
    for (let i = 0; i < 20; i++) {
      const a = rainDrop(i, 0.30), b = rainDrop(i, 0.32);
      if (b.y < a.y) continue; // капля ушла за низ экрана и начала сверху
      expect(b.y).toBeGreaterThan(a.y);
      expect(b.x).toBeLessThan(a.x);
    }
  });

  it('дождь не рисуется в стенах (мачта, крыша) и в воде', () => {
    for (const id of ['roof-1', 'slope-1', 'sea-1']) {
      const room = rooms.get(id)!;
      for (const t of [0.3, 1.7, BRIGHT]) {
        for (const g of stormGlyphs(room, t).filter(g => g.ch === ',' || (g.ch === '/' && g.color[0] === PAL.storm[0]))) {
          expect(room.tiles[Math.floor(g.y)][Math.floor(g.x)], `${id} ${g.x},${g.y}`).toBe('.');
        }
      }
    }
  });

  it('зыбь бежит, на гребнях барашки; где нет воды — нет и зыби', () => {
    expect(new Set([0, 1, 2, 3].map(t => swellH(10, t).toFixed(2))).size).toBeGreaterThan(1);
    const sea1 = rooms.get('sea-1')!;
    const foam = (t: number) => stormGlyphs(sea1, t).filter(g => g.color[0] === PAL.foam[0] && '*~'.includes(g.ch));
    expect(foam(0.5).length).toBeGreaterThan(0);
    for (const g of foam(0.5)) expect(swellH(g.x, 0.5)).toBeGreaterThan(STORM.foam);
    const roof = stormGlyphs(rooms.get('roof-1')!, 0.5);
    expect(roof.some(g => g.color === PAL.water)).toBe(false);
  });
});

describe('кадр пролога', () => {
  const count = (g: Game, time: number) => {
    let n = 0;
    const chars = new Set<string>();
    drawGame({ push: (_x: number, _y: number, ch: string) => { n++; chars.add(ch); }, text: (_x: number, _y: number, s: string) => { n += [...s].length; for (const c of s) chars.add(c); } } as never, g, time);
    return { n, chars };
  };

  it('на каждом экране пролога и в переходе: символы из атласа, глифов не больше 30000', () => {
    const g = createPrologue(rooms);
    const seen = new Set<string>();
    let transitions = 0;
    for (let i = 0; i < 3000 && g.prologue?.phase === 'fly'; i++) {
      stepGame(g, IDLE, DT);
      if (g.transition) transitions++;
      if (i % 30 && !g.transition) continue;
      seen.add(g.roomId);
      for (const t of [DARK, BRIGHT]) {
        const { n, chars } = count(g, t);
        expect(n).toBeLessThanOrEqual(30000);
        for (const ch of chars) expect(CHARSET).toContain(ch);
      }
    }
    expect([...seen].sort()).toEqual([...ROUTE].sort());
    expect(transitions).toBeGreaterThan(0);
  });

  it('шторм — только в комнатах «sky: storm»', () => {
    for (const r of rooms.values()) expect(r.meta.sky === 'storm', r.id).toBe(ROUTE.includes(r.id as never));
    const g = createPrologue(rooms);
    const inside = createPrologue(rooms);
    inside.roomId = 'lab-1';
    inside.prologue = null;
    const has = (x: Game) => {
      let foam = false;
      drawGame({ push: (_x: number, _y: number, _ch: string, c: unknown) => { if (c === PAL.storm || (Array.isArray(c) && c[0] === PAL.storm[0] && c[1] === PAL.storm[1])) foam = true; }, text: () => {} } as never, x, BRIGHT);
      return foam;
    };
    expect(has(g)).toBe(true);
    expect(has(inside)).toBe(false);
  });

  it('подсказка полёта — в небе: строка без воды и ниже строки HUD', () => {
    for (const id of ['sea-1', 'sea-2']) {
      const g = createPrologue(rooms);
      g.roomId = id;
      const ys: number[] = [];
      drawGame({ push: () => {}, text: (_x: number, y: number, s: string) => { if (s.includes('ОТЦЕПИТЬСЯ')) ys.push(y); } } as never, g, DARK);
      expect(ys, id).toHaveLength(1);
      expect(ys[0]).toBeGreaterThan(0);
      expect(rooms.get(id)!.tiles[Math.floor(ys[0])].includes('~'), id).toBe(false);
    }
  });

  it('во вспышку горы не заслоняют дельтаплан на крыше', () => {
    const roof = rooms.get('roof-1')!;
    const r = gliderRect(gliderAt(150));
    const inside = (g: { x: number; y: number }) => g.x >= r.x && g.x <= r.x + r.w && g.y >= r.y && g.y <= r.y + r.h;
    const slopes = (skip?: typeof r) => stormGlyphs(roof, BRIGHT, skip).filter(g => '=-.'.includes(g.ch) && g.color[0] === PAL.storm[0]);
    expect(slopes().some(inside)).toBe(true);
    expect(slopes(r).filter(inside)).toHaveLength(0);
    expect(slopes(r).length).toBeGreaterThan(0);
  });
});
