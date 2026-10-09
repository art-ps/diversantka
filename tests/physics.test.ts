import { describe, expect, it } from 'vitest';
import { moveX, moveY, type Body } from '../src/sim/physics';
import { FLOOR, roomOf } from './helpers';

const body = (x: number, y: number): Body => ({ x, y, w: 1.6, h: 5.5, vx: 0, vy: 0, onGround: false });

describe('moveY', () => {
  it('на любой скорости не проходит сквозь пол', () => {
    for (const dy of [50, 1000]) {
      const b = body(10, 2);
      expect(moveY(b, roomOf({ 20: FLOOR }), dy)).toBe(true);
      expect(b.y + b.h).toBeCloseTo(20);
      expect(b.onGround).toBe(true);
    }
  });

  it('упирается головой в потолок', () => {
    const b = body(10, 10);
    expect(moveY(b, roomOf({ 4: FLOOR }), -20)).toBe(true);
    expect(b.y).toBeCloseTo(5);
  });

  it('платформа = пропускает снизу и держит сверху', () => {
    const room = roomOf({ 10: '='.repeat(40) });
    const below = body(10, 12);
    expect(moveY(below, room, -5)).toBe(false);
    expect(below.y).toBeCloseTo(7);
    const above = body(10, 3);
    expect(moveY(above, room, 3)).toBe(true);
    expect(above.y + above.h).toBeCloseTo(10);
  });

  it('с ignoreOneWay платформа не держит', () => {
    const b = body(10, 3);
    expect(moveY(b, roomOf({ 10: '='.repeat(40) }), 3, { ignoreOneWay: true })).toBe(false);
    expect(b.y).toBeCloseTo(6);
  });

  it('верх лестницы держит как платформа', () => {
    const rows: Record<number, string> = {};
    for (let r = 10; r <= 19; r++) rows[r] = '.....H';
    const b = body(4.7, 0);
    expect(moveY(b, roomOf(rows), 10)).toBe(true);
    expect(b.y + b.h).toBeCloseTo(10);
  });
});

describe('moveX', () => {
  it('упирается в стену', () => {
    const rows: Record<number, string> = {};
    for (let r = 0; r < 25; r++) rows[r] = '.'.repeat(20) + '#';
    const b = body(15, 10);
    expect(moveX(b, roomOf(rows), 10)).toBe(true);
    expect(b.x).toBeCloseTo(18.4);
    expect(b.vx).toBe(0);
  });

  it('свободно выходит за край комнаты', () => {
    const b = body(38, 10);
    expect(moveX(b, roomOf({}), 5)).toBe(false);
    expect(b.x).toBeCloseTo(43);
  });
});
