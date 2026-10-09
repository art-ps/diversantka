import { describe, expect, it } from 'vitest';
import { DT, NINA } from '../src/config';
import { IDLE, type Intent } from '../src/input/intent';
import { createNina, updateNina, type Nina } from '../src/sim/nina';
import type { Room } from '../src/world/room';
import { FLOOR, roomOf } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const run = (n: Nina, room: Room, it: Intent, ticks: number) => { for (let i = 0; i < ticks; i++) updateNina(n, it, room, DT); };
const bottom = (n: Nina) => n.body.y + n.body.h;

describe('прыжок', () => {
  it('с места при удержании поднимает на jumpHeight ±0,1', () => {
    const room = roomOf({ 22: FLOOR });
    const n = createNina(10, 22);
    run(n, room, I(), 3);
    const startY = n.body.y;
    let minY = startY;
    updateNina(n, I({ jump: true, jumpPressed: true }), room, DT);
    for (let i = 0; i < 60; i++) { updateNina(n, I({ jump: true }), room, DT); minY = Math.min(minY, n.body.y); }
    expect(Math.abs(startY - minY - NINA.jumpHeight)).toBeLessThan(0.1);
  });

  it('короткое нажатие даёт низкий прыжок', () => {
    const room = roomOf({ 22: FLOOR });
    const n = createNina(10, 22);
    run(n, room, I(), 3);
    const startY = n.body.y;
    let minY = startY;
    updateNina(n, I({ jump: true, jumpPressed: true }), room, DT);
    for (let i = 0; i < 60; i++) { updateNina(n, I(), room, DT); minY = Math.min(minY, n.body.y); }
    expect(startY - minY).toBeLessThan(2);
  });

  const coyote = (idleTicks: number) => {
    const room = roomOf({ 22: '#'.repeat(20) });
    const n = createNina(17, 22);
    run(n, room, I(), 3);
    n.body.x = 20.5; // шагнула за край
    run(n, room, I(), idleTicks);
    updateNina(n, I({ jump: true, jumpPressed: true }), room, DT);
    return n.body.vy;
  };
  it('coyote time: через ~0,08 с после края прыжок срабатывает', () => expect(coyote(5)).toBeLessThan(0));
  it('coyote time: через 0,15 с — нет', () => expect(coyote(9)).toBeGreaterThan(0));

  const landingTick = () => {
    const room = roomOf({ 22: FLOOR });
    const n = createNina(10, 12);
    let t = 0;
    while (n.state !== 'ground') { t++; updateNina(n, I(), room, DT); }
    return t;
  };
  const buffered = (pressAt: number) => {
    const room = roomOf({ 22: FLOOR });
    const n = createNina(10, 12);
    const N = landingTick();
    for (let t = 1; t <= N + 1; t++) {
      const it = t === pressAt ? I({ jump: true, jumpPressed: true }) : t > pressAt ? I({ jump: true }) : I();
      updateNina(n, it, room, DT);
    }
    return { n, N };
  };
  it('буфер прыжка: нажатие за ~0,07 с до приземления даёт прыжок', () => {
    const { n } = buffered(landingTick() - 4);
    expect(n.body.vy).toBeLessThan(0);
  });
  it('буфер прыжка: нажатие за 0,13 с — нет', () => {
    const { n } = buffered(landingTick() - 8);
    expect(n.body.onGround).toBe(true);
    expect(n.body.vy).toBe(0);
  });
});

describe('энергия', () => {
  it('падение с высоты H снимает (H − safeFall) × fallDamagePerCell', () => {
    const room = roomOf({ 22: FLOOR });
    const n = createNina(10, 2);
    while (n.state !== 'ground') updateNina(n, I(), room, DT); // сразу после приземления, до восстановления
    const expected = NINA.energyMax - (20 - NINA.safeFall) * NINA.fallDamagePerCell;
    expect(Math.abs(n.energy - expected)).toBeLessThan(0.5);
    expect(n.dead).toBe(false);
  });

  it('энергия 0 — смерть', () => {
    const n = createNina(10, -2);
    run(n, roomOf({ 24: FLOOR }), I(), 120);
    expect(n.dead).toBe(true);
    expect(n.energy).toBe(0);
  });

  it('в покое восстанавливается', () => {
    const room = roomOf({ 22: FLOOR });
    const n = createNina(10, 22);
    n.energy = 50;
    run(n, room, I(), 60);
    expect(n.energy).toBeCloseTo(50 + NINA.regenPerSec, 0);
  });
});

describe('бег', () => {
  it('разгоняется до runSpeed и тормозит до нуля', () => {
    const room = roomOf({ 22: FLOOR });
    const n = createNina(2, 22);
    run(n, room, I({ moveX: 1 }), 30);
    expect(n.body.vx).toBeCloseTo(NINA.runSpeed);
    expect(n.facing).toBe(1);
    run(n, room, I(), 30);
    expect(n.body.vx).toBe(0);
  });
});

describe('лестница', () => {
  const ladderRoom = () => {
    const rows: Record<number, string> = { 14: '='.repeat(30) + 'H', 22: FLOOR };
    for (let r = 15; r <= 21; r++) rows[r] = '.'.repeat(30) + 'H';
    return roomOf(rows);
  };

  it('вверх до площадки и вниз до пола', () => {
    const room = ladderRoom();
    const n = createNina(29.7, 22);
    run(n, room, I(), 2);
    run(n, room, I({ up: true }), 120);
    expect(n.state).toBe('ground');
    expect(bottom(n)).toBeCloseTo(14);
    run(n, room, I({ down: true }), 120);
    expect(n.state).toBe('ground');
    expect(bottom(n)).toBeCloseTo(22);
    expect(n.energy).toBe(NINA.energyMax);
  });
});

describe('присед', () => {
  it('под низким потолком остаётся присевшей', () => {
    const room = roomOf({ 17: FLOOR, 22: FLOOR });
    const n = createNina(10, 22);
    n.crouching = true;
    n.body.h = NINA.crouchH;
    n.body.y = 22 - NINA.crouchH;
    n.body.onGround = true;
    run(n, room, I(), 5);
    expect(n.crouching).toBe(true);
    expect(n.body.h).toBe(NINA.crouchH);
  });

  it('на открытом месте встаёт', () => {
    const room = roomOf({ 22: FLOOR });
    const n = createNina(10, 22);
    run(n, room, I(), 2);
    run(n, room, I({ down: true }), 2);
    expect(n.crouching).toBe(true);
    run(n, room, I(), 2);
    expect(n.crouching).toBe(false);
    expect(n.body.h).toBe(NINA.h);
    expect(bottom(n)).toBeCloseTo(22);
  });
});
