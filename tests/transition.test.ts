import { expect, it } from 'vitest';
import { exitFor } from '../src/sim/transition';
import type { Body } from '../src/sim/physics';
import { roomOf } from './helpers';

const body = (x: number, y: number): Body => ({ x, y, w: 1.6, h: 5.5, vx: 3, vy: 0, onGround: false });

it('центр за правым краем и выход есть — переход со сдвигом −40', () => {
  expect(exitFor(body(39.5, 10), roomOf({}, { right: 'b' }))).toEqual({ dir: 'right', to: 'b', dx: -40, dy: 0 });
});

it('вниз — сдвиг −25, вверх — +25', () => {
  expect(exitFor(body(10, 23), roomOf({}, { down: 'c' }))?.dy).toBe(-25);
  expect(exitFor(body(10, -3), roomOf({}, { up: 'u' }))?.dy).toBe(25);
});

it('выхода нет — тело остаётся в комнате и останавливается', () => {
  const b = body(39.5, 10);
  expect(exitFor(b, roomOf({}))).toBeNull();
  expect(b.x + b.w / 2).toBeLessThan(40);
  expect(b.vx).toBe(0);
});

it('внутри комнаты — null', () => {
  expect(exitFor(body(10, 10), roomOf({}, { right: 'b' }))).toBeNull();
});
