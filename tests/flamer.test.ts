import { describe, expect, it } from 'vitest';
import { DT, FLAMER, NINA } from '../src/config';
import { IDLE } from '../src/input/intent';
import { createFlamer, flameRect, flamerPhase, stepFlamer } from '../src/sim/flamer';
import { burnNina, createNina, updateNina } from '../src/sim/nina';
import { FLOOR, roomOf } from './helpers';

const flamer = () => createFlamer('r#e0', { kind: 'flamer', x: 38, y: 19, dir: -1 });

describe('огнемёт', () => {
  it('цикл: пауза → искрит → огонь → пауза', () => {
    const f = flamer();
    expect(flamerPhase(f)).toBe('off');
    stepFlamer(f, FLAMER.off - FLAMER.warn / 2);
    expect(flamerPhase(f)).toBe('warn');
    stepFlamer(f, FLAMER.warn);
    expect(flamerPhase(f)).toBe('on');
    stepFlamer(f, FLAMER.on);
    expect(flamerPhase(f)).toBe('off');
  });

  it('струя — только во время огня, влево от сопла на length клеток', () => {
    const f = flamer();
    expect(flameRect(f)).toBeNull();
    stepFlamer(f, FLAMER.off + 0.1);
    expect(flameRect(f)).toEqual({ x: 38 - FLAMER.length, y: 19 - FLAMER.halfH, w: FLAMER.length, h: 2 * FLAMER.halfH });
  });

  it('стоя героиня в пламени, присев — под ним', () => {
    const f = flamer();
    stepFlamer(f, FLAMER.off + 0.1);
    const r = flameRect(f)!;
    const room = roomOf({ 22: FLOOR });
    const n = createNina(34, 22);
    for (let i = 0; i < 3; i++) updateNina(n, IDLE, room, DT);
    const hits = (b: typeof n.body) => r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h;
    expect(hits(n.body)).toBe(true);
    for (let i = 0; i < 3; i++) updateNina(n, { ...IDLE, down: true }, room, DT);
    expect(hits(n.body)).toBe(false);
  });

  it('ожог снимает энергию без оглушения и неуязвимости', () => {
    const n = createNina(10, 22);
    burnNina(n, 5);
    expect(n.energy).toBe(NINA.energyMax - 5);
    expect(n.hurtT).toBe(0);
    expect(n.invulnT).toBe(0);
    burnNina(n, NINA.energyMax);
    expect(n.dead).toBe(true);
  });
});
