import { describe, expect, it } from 'vitest';
import {
  IntentTracker, clearPressed, fromGamepad, fromKeyboard, merge, orPressed, IDLE, NO_BUTTONS, type PadSnapshot,
} from '../src/input/intent';

const pad = (axes: number[], pressed: number[] = []): PadSnapshot => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
});

describe('устройства → кнопки', () => {
  it('клавиатура и геймпад дают одинаковые намерения', () => {
    const k = new IntentTracker().update(fromKeyboard(new Set(['KeyD', 'Space'])));
    const g = new IntentTracker().update(fromGamepad(pad([1, 0], [0])));
    expect(g).toEqual(k);
    expect(k.moveX).toBe(1);
    expect(k.jumpPressed).toBe(true);
  });

  it('раскладка геймпада: X удар, B бросок, Y терминал, Start пауза', () => {
    const b = fromGamepad(pad([0, 0], [2, 1, 3, 9]));
    expect([b.attack, b.throw, b.use, b.pause]).toEqual([true, true, true, true]);
  });

  it('мёртвая зона стика и крестовина', () => {
    expect(fromGamepad(pad([0.2, 0])).axisX).toBe(0);
    expect(fromGamepad(pad([0, 0], [14])).axisX).toBe(-1);
    expect(fromGamepad(pad([0, -0.9])).up).toBe(true);
    expect(fromGamepad(pad([0, 0], [13])).down).toBe(true);
  });

  it('урезанный геймпад без кнопок и осей не ломает чтение', () => {
    expect(fromGamepad({ axes: [], buttons: [] })).toEqual(NO_BUTTONS);
  });

  it('merge берёт более сильную ось и OR кнопок', () => {
    const m = merge(fromKeyboard(new Set(['KeyJ'])), fromGamepad(pad([-0.7, 0])));
    expect(m.axisX).toBeCloseTo(-0.7);
    expect(m.attack).toBe(true);
  });
});

describe('IntentTracker', () => {
  it('нажатие — только в первом кадре удержания', () => {
    const t = new IntentTracker();
    const held = fromKeyboard(new Set(['Space']));
    expect(t.update(held).jumpPressed).toBe(true);
    expect(t.update(held).jumpPressed).toBe(false);
    expect(t.update(held).jump).toBe(true);
    expect(t.update(NO_BUTTONS).jump).toBe(false);
  });
});

describe('перенос нажатий между кадрами (120 Гц)', () => {
  it('clearPressed снимает только нажатия', () => {
    const i = { ...IDLE, jump: true, jumpPressed: true, moveX: 1 };
    expect(clearPressed(i)).toEqual({ ...IDLE, jump: true, moveX: 1 });
  });

  it('orPressed сохраняет нажатие из кадра без шага', () => {
    const missed = { ...IDLE, jumpPressed: true, jump: true };
    const now = { ...IDLE, jump: true };
    expect(orPressed(now, missed).jumpPressed).toBe(true);
    expect(orPressed(now, missed).jump).toBe(true);
  });
});
