import { describe, expect, it } from 'vitest';
import { COMBAT, DT, FLAMER, MISSION, NINA } from '../src/config';
import { createGame, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { PAL } from '../src/render/palette';
import { drawGame, drawSource } from '../src/render/scene';
import { createMission, missionResult, restoreCheckpoint, saveCheckpoint } from '../src/sim/mission';
import { burnNina, createNina, hurtNina, updateNina } from '../src/sim/nina';
import type { Room } from '../src/world/room';
import { FLOOR, roomOf } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const run = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) stepGame(g, I(p), DT);
};
const R = (rows: Record<number, string>, meta: Record<string, string>): Room => ({ ...roomOf({ 22: FLOOR, ...rows }), id: 's', meta });
// Пол на 22; источник на 20; шипы в клетке 30,21; огнемёт бьёт по полу у x 8..14.
const spring = () => createGame(new Map([['s', R({ 21: '..............................^' }, { source: '20,22' })]]), { room: 's', x: 15, bottom: 22 });
const touch = (g: Game) => { run(g, {}, 5); run(g, { moveX: 1 }, 120, () => g.mission.secret); };

describe('бессмертие героини', () => {
  it('удар оглушает и отбрасывает, но энергию не отнимает', () => {
    const n = createNina(10, 22);
    n.immortal = true;
    expect(hurtNina(n, 50, 1)).toBe(true);
    expect(n.energy).toBe(NINA.energyMax);
    expect(n.hurtT).toBeCloseTo(COMBAT.hurtStun);
    expect(n.invulnT).toBeCloseTo(COMBAT.hurtInvuln);
    expect(n.body.vx).toBeCloseTo(COMBAT.hurtPush);
    for (let i = 0; i < 10; i++) hurtNina(n, 500, -1);
    expect(n.dead).toBe(false);
  });

  it('огонь и вода не жгут', () => {
    const n = createNina(10, 22);
    n.immortal = true;
    burnNina(n, 500);
    expect(n.energy).toBe(NINA.energyMax);
    expect(n.dead).toBe(false);
  });

  it('падение с большой высоты не отнимает энергию; без источника — отнимает', () => {
    for (const immortal of [true, false]) {
      const n = createNina(10, 3);
      n.immortal = immortal;
      for (let i = 0; i < 120; i++) updateNina(n, IDLE, roomOf({ 22: FLOOR }), DT);
      expect(n.body.onGround).toBe(true);
      if (immortal) expect(n.energy).toBe(NINA.energyMax);
      else expect(n.energy).toBeLessThan(NINA.energyMax);
    }
  });
});

describe('источник', () => {
  it('касание: флаг миссии, надпись, Нина бессмертна', () => {
    const g = spring();
    touch(g);
    expect(g.mission.secret).toBe(true);
    expect(g.nina.immortal).toBe(true);
    expect(g.floaters.some(f => f.text === 'ИСТОЧНИК НАЙДЕН')).toBe(true);
  });

  it('после источника шипы бьют, но энергия не убывает; удар считается', () => {
    const g = spring();
    touch(g);
    run(g, { moveX: 1 }, 120, () => g.nina.hurtT > 0);
    expect(g.nina.hurtT).toBeGreaterThan(0);
    expect(g.nina.energy).toBe(NINA.energyMax);
    expect(g.mission.hits).toBe(1);
    expect(g.floaters.some(f => f.text.startsWith('-'))).toBe(false);
  });

  it('огнемёт после источника не убивает', () => {
    const g = createGame(new Map([['s', R({}, { source: '20,22', enemies: 'flamer@14,20 dir=left' })]]), { room: 's', x: 15, bottom: 22 });
    touch(g);
    g.nina = createNina(9, 22);
    run(g, {}, Math.round((FLAMER.off + FLAMER.on) * 3 / DT));
    expect(g.nina.dead).toBe(false);
    expect(g.nina.energy).toBe(NINA.energyMax);
  });

  it('чекпоинт не откатывает источник; после возрождения Нина снова бессмертна', () => {
    const m = createMission({ room: 's', x: 1, bottom: 22 });
    saveCheckpoint(m, { room: 's', x: 1, bottom: 22 });
    m.secret = true;
    restoreCheckpoint(m);
    expect(m.secret).toBe(true);
    const g = spring();
    touch(g);
    g.nina.dead = true; // смерть без урона невозможна — кладём героиню вручную
    run(g, {}, Math.round(NINA.respawnDelay / DT) + 2);
    run(g, { jump: true, jumpPressed: true }, 1);
    expect(g.nina.dead).toBe(false);
    run(g, {}, 1);
    expect(g.mission.secret).toBe(true);
    expect(g.nina.immortal).toBe(true);
  });

  it('«заново» после итога — источник снова не найден', () => {
    const g = spring();
    touch(g);
    g.mission.result = 'won';
    run(g, {}, Math.round((MISSION.outroTime + MISSION.restartDelay) / DT) + 2);
    run(g, { jump: true, jumpPressed: true }, 1);
    expect(g.mission.secret).toBe(false);
    expect(g.nina.immortal).toBe(false);
  });

  it('итог: «источник найден: да» в строке и на экране', () => {
    const g = spring();
    touch(g);
    g.mission.result = 'won';
    g.endT = MISSION.outroTime;
    expect(missionResult(g.mission).line).toContain('источник найден: да');
    const out: string[] = [];
    drawGame({ push: () => {}, text: (_x: number, _y: number, s: string) => { out.push(s); } } as never, g, 1);
    expect(out).toContain('ИСТОЧНИК НАЙДЕН: ДА');
  });
});

describe('рисунок источника и HUD', () => {
  it('пульсирует; символы — из атласа; над полом', () => {
    const shot = (t: number) => {
      const out: { y: number; ch: string; s: number }[] = [];
      drawSource({ push: (_x, y, ch, _c, s = 1) => { out.push({ y: y + 0.5, ch, s }); } }, { x: 20, bottom: 22 }, 0, 0, t);
      return out;
    };
    const sizes = new Set([0, 0.2, 0.4, 0.6].map(t => shot(t).find(p => p.ch === '*')!.s.toFixed(2)));
    expect(sizes.size).toBeGreaterThan(1);
    for (const p of shot(0.3)) {
      expect(CHARSET).toContain(p.ch);
      expect(p.y + p.s / 2).toBeLessThanOrEqual(22);
    }
  });

  it('частицы над источником появляются сами', () => {
    const g = spring();
    run(g, {}, 120);
    expect(g.particles.some(p => p.color === PAL.source)).toBe(true);
  });

  it('полоса энергии после источника — своего цвета', () => {
    const barColor = (g: Game) => {
      let c: unknown;
      drawGame({ push: () => {}, text: (_x: number, _y: number, s: string, col: unknown) => { if (s.startsWith('█')) c = col; } } as never, g, 1);
      return c;
    };
    const g = spring();
    run(g, {}, 5);
    expect(barColor(g)).toBe(PAL.hud);
    touch(g);
    expect(barColor(g)).toBe(PAL.source);
  });
});
