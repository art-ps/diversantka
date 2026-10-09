import { describe, expect, it } from 'vitest';
import { FX } from '../src/config';
import { floaterView, spawnFloater, stepFloaters, type Floater } from '../src/sim/floaters';
import { CHARSET } from '../src/render/atlas';

describe('всплывающие числа', () => {
  it('поднимаются, к концу гаснут и исчезают', () => {
    let list: Floater[] = [];
    spawnFloater(list, '-12', 10, 18, 'damage');
    const v0 = floaterView(list[0]);
    expect(v0.alpha).toBe(1);
    list = stepFloaters(list, FX.floatTime / 2);
    const v1 = floaterView(list[0]);
    expect(v1.y).toBeLessThan(v0.y);
    list = stepFloaters(list, FX.floatTime / 2 - FX.floatFade / 2);
    expect(floaterView(list[0]).alpha).toBeLessThan(1);
    expect(floaterView(list[0]).alpha).toBeGreaterThan(0);
    list = stepFloaters(list, FX.floatTime);
    expect(list).toHaveLength(0);
    expect(v0.y - floaterView({ ...list[0] ?? { text: '', x: 0, y: 18, t: FX.floatTime, kind: 'damage' } }).y).toBeCloseTo(FX.floatRise, 1);
  });

  it('несколько подряд — не наслаиваются в одну точку', () => {
    const list: Floater[] = [];
    spawnFloater(list, '-1', 10, 18, 'enemy');
    spawnFloater(list, '-1', 10, 18, 'enemy');
    expect(list[0].x).not.toBe(list[1].x);
  });

  it('все символы чисел и подписей есть в атласе', () => {
    for (const ch of '-0123456789ВЫВЕДЕНблок') expect(CHARSET).toContain(ch);
  });
});
