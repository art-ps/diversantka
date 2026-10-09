import { describe, expect, it } from 'vitest';
import { COMBAT, DT } from '../src/config';
import { IDLE, type Intent } from '../src/input/intent';
import { projectileHit, stepProjectiles, useThrowButton, type Item, type Projectile } from '../src/sim/items';
import { createNina, updateNina } from '../src/sim/nina';
import { FLOOR, roomOf } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const ROOM = roomOf({ 22: FLOOR });
const standing = (x = 10) => { const n = createNina(x, 22); for (let i = 0; i < 3; i++) updateNina(n, I(), ROOM, DT); return n; };
const knife = (x: number): Item => ({ id: 'r#i0', kind: 'knife', x, bottom: 22 });

describe('подобрать и бросить', () => {
  it('под ногами — подбирает, вдалеке — нет', () => {
    const n = standing(10);
    expect(useThrowButton(n, I({ throwPressed: true }), [knife(20)]).picked).toBeUndefined();
    const r = useThrowButton(n, I({ throwPressed: true }), [knife(10.6)]);
    expect(r.picked?.kind).toBe('knife');
    expect(n.held).toBe('knife');
  });

  it('бросок прямо, по диагонали вверх и вниз', () => {
    const dirs: [Partial<Intent>, number][] = [[{}, 0], [{ up: true }, -1], [{ down: true }, 1]];
    for (const [p, sign] of dirs) {
      const n = standing();
      n.held = 'knife';
      const t = useThrowButton(n, I({ throwPressed: true, ...p }), []).thrown!;
      expect(Math.sign(t.vy)).toBe(sign);
      expect(t.vx).toBeGreaterThan(0);
      expect(Math.hypot(t.vx, t.vy)).toBeCloseTo(COMBAT.items.knife.speed);
      expect(n.held).toBeNull();
      expect(n.throwT).toBeCloseTo(COMBAT.throwTime);
    }
  });

  it('без кнопки ничего не происходит', () => {
    const n = standing();
    n.held = 'stone';
    expect(useThrowButton(n, I(), [])).toEqual({});
    expect(n.held).toBe('stone');
  });
});

describe('снаряды', () => {
  const p = (q: Partial<Projectile>): Projectile => ({ kind: 'knife', x: 5, y: 10, vx: 20, vy: 0, from: 'nina', damage: 1, alive: true, ...q });

  it('нож летит прямо и гибнет о стену', () => {
    const rows: Record<number, string> = {};
    for (let r = 0; r < 25; r++) rows[r] = '.'.repeat(15) + '#';
    const room = roomOf(rows);
    const k = p({});
    for (let i = 0; i < 60 && k.alive; i++) stepProjectiles([k], room, DT);
    expect(k.alive).toBe(false);
    expect(k.x).toBeLessThan(16);
    expect(k.y).toBe(10);
  });

  it('камень летит по дуге', () => {
    const s = p({ kind: 'stone', vx: 10 });
    stepProjectiles([s], roomOf({}), 0.5);
    expect(s.vy).toBeGreaterThan(0);
    expect(s.y).toBeGreaterThan(10);
  });

  it('попадание — точка внутри прямоугольника', () => {
    expect(projectileHit(p({ x: 3, y: 3 }), { x: 2, y: 2, w: 2, h: 2 })).toBe(true);
    expect(projectileHit(p({ x: 5, y: 3 }), { x: 2, y: 2, w: 2, h: 2 })).toBe(false);
    expect(projectileHit(p({ x: 3, y: 3, alive: false }), { x: 2, y: 2, w: 2, h: 2 })).toBe(false);
  });
});
