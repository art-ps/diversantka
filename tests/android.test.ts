import { describe, expect, it } from 'vitest';
import { ANDROID, COMBAT, DT, NINA } from '../src/config';
import { IDLE } from '../src/input/intent';
import { androidPunchBox, createAndroid, hitAndroid, seesNina, updateAndroid, type Android } from '../src/sim/android';
import { resolveCombat } from '../src/sim/fight';
import { projectileHit, stepProjectiles, type Projectile } from '../src/sim/items';
import { createNina, updateNina, type Nina } from '../src/sim/nina';
import { bodyRect } from '../src/sim/rect';
import { FLOOR, roomOf } from './helpers';

const ROOM = roomOf({ 22: FLOOR, 14: '='.repeat(40) });
const center = (a: Android) => a.body.x + a.body.w / 2;
const android = (x = 20) => createAndroid('r#e0', { kind: 'android', x, bottom: 22, patrol: [12, 28] });
const ninaAt = (x: number, bottom = 22): Nina => {
  const n = createNina(x, bottom);
  for (let i = 0; i < 3; i++) updateNina(n, IDLE, ROOM, DT);
  return n;
};
const far = () => ninaAt(2, 14); // на другом этаже — не видит

describe('андроид: патруль', () => {
  it('не выходит за участок и разворачивается', () => {
    const a = android();
    const n = far();
    let turned = false;
    for (let i = 0; i < 60 * 20; i++) {
      const f = a.facing;
      updateAndroid(a, n, ROOM, DT);
      if (a.facing !== f) turned = true;
      expect(center(a)).toBeGreaterThanOrEqual(12 - 1e-6);
      expect(center(a)).toBeLessThanOrEqual(28 + 1e-6);
      expect(a.body.y + a.body.h).toBeCloseTo(22);
    }
    expect(turned).toBe(true);
  });

  it('видит только на своём этаже и в пределах обзора', () => {
    const a = android();
    expect(seesNina(a, ninaAt(30))).toBe(true);
    expect(seesNina(a, far())).toBe(false);
    expect(seesNina(a, ninaAt(20 + ANDROID.sight + 3))).toBe(false);
  });

  it('преследуя, не выходит за участок', () => {
    const a = android();
    const n = ninaAt(33); // за правой границей участка, но в обзоре
    for (let i = 0; i < 60 * 5; i++) updateAndroid(a, n, ROOM, DT);
    expect(center(a)).toBeLessThanOrEqual(28 + 1e-6);
  });
});

describe('андроид: атаки', () => {
  it('hitAndroid сообщает результат: попадание, блок, вывод из строя', () => {
    const a = android();
    expect(hitAndroid(a, 1, 1)).toBe('hit');
    expect(hitAndroid(a, 1, 1)).toBe('blocked');
    a.invulnT = 0;
    a.hp = 1;
    expect(hitAndroid(a, 1, 1)).toBe('killed');
    expect(hitAndroid(a, 1, 1)).toBe('none');
  });

  it('издалека бросает нож на уровне головы после замаха', () => {
    const a = android(20);
    const n = ninaAt(30);
    let knife: Projectile | null = null;
    let t = 0;
    while (!knife && t < 2) { knife = updateAndroid(a, n, ROOM, DT); t += DT; }
    expect(knife).not.toBeNull();
    expect(t).toBeGreaterThanOrEqual(ANDROID.throwWindup);
    expect(knife!.y).toBeCloseTo(a.body.y + ANDROID.knifeHeight * a.body.h);
    expect(knife!.vx).toBeGreaterThan(0);
    expect(updateAndroid(a, n, ROOM, DT)).toBeNull(); // перезарядка
  });

  it('вблизи бьёт рукой: зона удара только в активной фазе', () => {
    const a = android(20);
    const n = ninaAt(20.6); // центр в 1.2 клетки от андроида — ближе meleeRange
    updateAndroid(a, n, ROOM, DT);
    expect(a.state).toBe('punch');
    expect(androidPunchBox(a)).toBeNull();
    for (let i = 0; i < Math.ceil(ANDROID.punch.windup / DT); i++) updateAndroid(a, n, ROOM, DT);
    expect(androidPunchBox(a)).not.toBeNull();
  });

  it('три попадания — падает и больше не действует', () => {
    const a = android();
    hitAndroid(a, 1, 1); a.invulnT = 0; hitAndroid(a, 1, 1);
    expect(a.state).toBe('hurt');
    a.invulnT = 0; hitAndroid(a, 1, 1);
    expect(a.state).toBe('dead');
    expect(updateAndroid(a, ninaAt(30), ROOM, DT)).toBeNull();
    expect(a.state).toBe('dead');
  });
});

describe('неуязвимость после попадания', () => {
  it('попадание во время неуязвимости не считается', () => {
    const a = android();
    hitAndroid(a, 1, 1); hitAndroid(a, 1, 1);
    expect(a.hp).toBe(ANDROID.hp - 1);
    const n = far();
    for (let i = 0; i < Math.ceil(ANDROID.hitInvuln / DT) + 1; i++) updateAndroid(a, n, ROOM, DT);
    hitAndroid(a, 1, 1);
    expect(a.hp).toBe(ANDROID.hp - 2);
  });
});

describe('нож и присед', () => {
  const throwAt = (n: Nina) => {
    const a = android(20);
    let knife: Projectile | null = null;
    while (!knife) knife = updateAndroid(a, n, ROOM, DT);
    for (let i = 0; i < 120 && knife.alive; i++) {
      stepProjectiles([knife], ROOM, DT);
      if (projectileHit(knife, bodyRect(n.body))) return true;
    }
    return false;
  };

  it('стоя — нож попадает', () => expect(throwAt(ninaAt(30))).toBe(true));

  it('присев — нож пролетает над головой', () => {
    const n = ninaAt(30);
    for (let i = 0; i < 3; i++) updateNina(n, { ...IDLE, down: true }, ROOM, DT);
    expect(n.crouching).toBe(true);
    expect(throwAt(n)).toBe(false);
  });
});

describe('разрешение боя', () => {
  it('удар сидя попадает по андроиду и не отбрасывает его', () => {
    const a = android(20);
    const n = ninaAt(18.4);
    for (let i = 0; i < 2; i++) updateNina(n, { ...IDLE, down: true }, ROOM, DT);
    updateNina(n, { ...IDLE, down: true, attackPressed: true }, ROOM, DT);
    const x0 = a.body.x;
    for (let i = 0; i < 30; i++) {
      updateNina(n, { ...IDLE, down: true }, ROOM, DT);
      resolveCombat(n, [a], [], ROOM);
    }
    expect(a.hp).toBe(ANDROID.hp - 1);
    expect(a.body.x).toBe(x0);
  });

  it('удар героини засчитывается один раз за удар', () => {
    const a = android(20);
    const n = ninaAt(18.2);
    updateNina(n, { ...IDLE, attackPressed: true }, ROOM, DT);
    for (let i = 0; i < 30; i++) {
      updateNina(n, IDLE, ROOM, DT);
      resolveCombat(n, [a], [], ROOM);
    }
    expect(a.hp).toBe(ANDROID.hp - 1);
  });

  const strike = (n: Nina, a: Android, up: boolean) => {
    updateNina(n, { ...IDLE, attackPressed: true, up }, ROOM, DT);
    for (let i = 0; i < 30; i++) {
      updateNina(n, IDLE, ROOM, DT);
      resolveCombat(n, [a], [], ROOM);
    }
  };

  it('пинок отбрасывает андроида по направлению героини, удар рукой — нет', () => {
    const k = android(20);
    strike(ninaAt(18.2), k, true);
    expect(k.hp).toBe(ANDROID.hp - 1);
    expect(center(k)).toBeCloseTo(20 + COMBAT.kick.push);
    const p = android(20);
    strike(ninaAt(18.2), p, false);
    expect(p.hp).toBe(ANDROID.hp - 1);
    expect(center(p)).toBeCloseTo(20);
  });

  it('отброс упирается в край участка', () => {
    const a = android(27.5);
    strike(ninaAt(25.7), a, true);
    expect(center(a)).toBeCloseTo(28);
  });

  it('нож андроида и удар в одном кадре — энергия снимается один раз', () => {
    const a = android(20);
    const n = ninaAt(21.2);
    a.state = 'punch';
    a.t = ANDROID.punch.windup;
    const knife: Projectile = { kind: 'knife', x: n.body.x + 0.5, y: n.body.y + 1, vx: 0, vy: 0, from: 'enemy', damage: ANDROID.knifeDamage, alive: true, hitWall: false };
    resolveCombat(n, [a], [knife], ROOM);
    expect(NINA.energyMax - n.energy).toBe(ANDROID.punch.damage);
  });

  it('возвращает id убитых', () => {
    const a = android();
    a.hp = 1;
    const p: Projectile = { kind: 'stone', x: center(a), y: a.body.y + 1, vx: 1, vy: 0, from: 'nina', damage: 1, alive: true, hitWall: false };
    expect(resolveCombat(ninaAt(2, 14), [a], [p], ROOM)).toEqual(['r#e0']);
  });
});
