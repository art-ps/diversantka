import { describe, expect, it } from 'vitest';
import { COMBAT, DT, NINA } from '../src/config';
import { IDLE, type Intent } from '../src/input/intent';
import { attackBox, attackTotal } from '../src/sim/combat';
import { createNina, hurtNina, updateNina, type Nina } from '../src/sim/nina';
import type { Room } from '../src/world/room';
import { FLOOR, roomOf } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const run = (n: Nina, room: Room, it: Intent, ticks: number) => { for (let i = 0; i < ticks; i++) updateNina(n, it, room, DT); };
const ROOM = roomOf({ 22: FLOOR });
const standing = () => { const n = createNina(10, 22); run(n, ROOM, I(), 3); return n; };

describe('удары героини', () => {
  it('с места — рука, вверх + удар — нога, в прыжке — нога в прыжке', () => {
    const a = standing();
    updateNina(a, I({ attackPressed: true }), ROOM, DT);
    expect(a.attack?.kind).toBe('punch');
    const b = standing();
    updateNina(b, I({ attackPressed: true, up: true }), ROOM, DT);
    expect(b.attack?.kind).toBe('kick');
    const c = standing();
    updateNina(c, I({ jump: true, jumpPressed: true }), ROOM, DT);
    run(c, ROOM, I({ jump: true }), 5);
    updateNina(c, I({ attackPressed: true }), ROOM, DT);
    expect(c.attack?.kind).toBe('flykick');
  });

  it('зона удара — только в активной фазе, перед телом по взгляду', () => {
    const n = standing();
    updateNina(n, I({ attackPressed: true }), ROOM, DT);
    expect(attackBox(n.body, n.facing, n.attack)).toBeNull(); // замах
    run(n, ROOM, I(), Math.ceil(COMBAT.punch.windup / DT));
    const box = attackBox(n.body, n.facing, n.attack)!;
    expect(box.x).toBeCloseTo(n.body.x + n.body.w);
    expect(box.w).toBeCloseTo(COMBAT.punch.reach);
    expect(box.y).toBeCloseTo(n.body.y + COMBAT.punch.top * n.body.h);
    run(n, ROOM, I(), Math.ceil(attackTotal('punch') / DT));
    expect(n.attack).toBeNull();
  });

  it('взгляд влево — зона слева', () => {
    const n = standing();
    run(n, ROOM, I({ moveX: -1 }), 1);
    run(n, ROOM, I(), 20);
    updateNina(n, I({ attackPressed: true }), ROOM, DT);
    run(n, ROOM, I(), Math.ceil(COMBAT.punch.windup / DT));
    const box = attackBox(n.body, n.facing, n.attack)!;
    expect(box.x + box.w).toBeCloseTo(n.body.x);
  });

  it('удар на земле: героиня останавливается и не прыгает', () => {
    const n = standing();
    run(n, ROOM, I({ moveX: 1 }), 30);
    updateNina(n, I({ attackPressed: true, moveX: 1 }), ROOM, DT);
    run(n, ROOM, I({ moveX: 1, jump: true, jumpPressed: true }), 5);
    expect(n.body.vx).toBeLessThan(NINA.runSpeed);
    expect(n.state).toBe('ground');
  });

  it('удар ногой в прыжке кончается при приземлении', () => {
    const n = standing();
    updateNina(n, I({ jump: true, jumpPressed: true }), ROOM, DT);
    run(n, ROOM, I({ jump: true }), 3);
    updateNina(n, I({ attackPressed: true }), ROOM, DT);
    while (n.state === 'air') updateNina(n, I(), ROOM, DT);
    updateNina(n, I(), ROOM, DT);
    expect(n.attack).toBeNull();
  });

  it('в приседе — удар ногой сидя, героиня не встаёт', () => {
    const n = standing();
    run(n, ROOM, I({ down: true }), 2);
    updateNina(n, I({ down: true, attackPressed: true }), ROOM, DT);
    expect(n.attack?.kind).toBe('crouchkick');
    for (let i = 0; i < Math.ceil(attackTotal('crouchkick') / DT); i++) {
      updateNina(n, I({ down: true }), ROOM, DT);
      expect(n.crouching).toBe(true);
      expect(n.body.h).toBe(NINA.crouchH);
    }
  });

  it('удар сидя — низкая зона у ног', () => {
    const n = standing();
    run(n, ROOM, I({ down: true }), 2);
    updateNina(n, I({ down: true, attackPressed: true }), ROOM, DT);
    run(n, ROOM, I({ down: true }), Math.ceil(COMBAT.crouchkick.windup / DT));
    const box = attackBox(n.body, n.facing, n.attack)!;
    expect(box.y).toBeGreaterThanOrEqual(n.body.y + 0.5 * n.body.h - 1e-9);
    expect(box.y + box.h).toBeLessThanOrEqual(n.body.y + n.body.h + 1e-9);
    expect(box.w).toBeCloseTo(COMBAT.crouchkick.reach);
  });

  it('после удара сидя: держишь «вниз» — сидит, отпустил — встаёт', () => {
    const n = standing();
    run(n, ROOM, I({ down: true }), 2);
    updateNina(n, I({ down: true, attackPressed: true }), ROOM, DT);
    run(n, ROOM, I({ down: true }), Math.ceil(attackTotal('crouchkick') / DT) + 2);
    expect(n.attack).toBeNull();
    expect(n.crouching).toBe(true);
    run(n, ROOM, I(), 2);
    expect(n.crouching).toBe(false);
  });

  it('на лестнице удар не начинается', () => {
    const rows: Record<number, string> = { 14: '='.repeat(30) + 'H', 22: FLOOR };
    for (let r = 15; r <= 21; r++) rows[r] = '.'.repeat(30) + 'H';
    const room = roomOf(rows);
    const n = createNina(29.9, 22);
    run(n, room, I(), 2);
    run(n, room, I({ up: true }), 10);
    expect(n.state).toBe('ladder');
    updateNina(n, I({ up: true, attackPressed: true }), room, DT);
    expect(n.attack).toBeNull();
  });
});

describe('урон по героине', () => {
  it('энергия, оглушение и неуязвимость', () => {
    const n = standing();
    expect(hurtNina(n, 10, 1)).toBe(true);
    expect(n.energy).toBe(NINA.energyMax - 10);
    expect(hurtNina(n, 10, 1)).toBe(false); // неуязвима
    expect(n.energy).toBe(NINA.energyMax - 10);
    const x = n.body.x;
    run(n, ROOM, I({ moveX: -1 }), 5); // ввод не слушается, отбрасывает вправо
    expect(n.body.x).toBeGreaterThan(x);
    run(n, ROOM, I(), Math.ceil(COMBAT.hurtInvuln / DT));
    expect(hurtNina(n, 10, 1)).toBe(true);
  });

  it('урон прерывает удар', () => {
    const n = standing();
    updateNina(n, I({ attackPressed: true }), ROOM, DT);
    hurtNina(n, 5, -1);
    expect(n.attack).toBeNull();
  });

  it('энергия до нуля — смерть', () => {
    const n = standing();
    hurtNina(n, NINA.energyMax + 5, 1);
    expect(n.dead).toBe(true);
    expect(n.energy).toBe(0);
  });
});

describe('гибель и лестница', () => {
  const bottomOf = (n: Nina) => n.body.y + n.body.h;
  const ladderRoom = () => {
    const rows: Record<number, string> = { 14: '='.repeat(30) + 'H', 22: FLOOR };
    for (let r = 15; r <= 21; r++) rows[r] = '.'.repeat(30) + 'H';
    return roomOf(rows);
  };

  it('смерть в прыжке: тело падает на пол', () => {
    const n = standing();
    updateNina(n, I({ jump: true, jumpPressed: true }), ROOM, DT);
    run(n, ROOM, I({ jump: true }), 5);
    hurtNina(n, NINA.energyMax + 1, 1);
    run(n, ROOM, I(), 120);
    expect(bottomOf(n)).toBeCloseTo(22);
    expect(n.dead).toBe(true);
  });

  it('смерть на лестнице: тело падает на пол', () => {
    const room = ladderRoom();
    const n = createNina(29.7, 22);
    run(n, room, I(), 2);
    run(n, room, I({ up: true }), 30);
    expect(n.state).toBe('ladder');
    hurtNina(n, NINA.energyMax + 1, 1);
    run(n, room, I(), 120);
    expect(bottomOf(n)).toBeCloseTo(22);
    expect(n.dead).toBe(true);
  });

  it('удар на лестнице не толкает и не сбрасывает', () => {
    const room = ladderRoom();
    const n = createNina(29.7, 22);
    run(n, room, I(), 2);
    run(n, room, I({ up: true }), 30);
    hurtNina(n, 5, 1);
    expect(n.body.vx).toBe(0);
    run(n, room, I(), 5);
    expect(n.state).toBe('ladder');
  });
});
