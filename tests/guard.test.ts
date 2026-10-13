import { describe, expect, it } from 'vitest';
import { COMBAT, DT, GUARD, NINA } from '../src/config';
import { createGame, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { PAL } from '../src/render/palette';
import { drawGame } from '../src/render/scene';
import { solidRoom } from '../src/sim/doors';
import { resolveCombat, resolveGuards } from '../src/sim/fight';
import { createGuard, guardSees, hitGuard, updateGuard, type Guard } from '../src/sim/guard';
import { projectileHit, stepProjectiles, type Projectile } from '../src/sim/items';
import { createNina, updateNina, type Nina } from '../src/sim/nina';
import { bodyRect } from '../src/sim/rect';
import type { Room } from '../src/world/room';
import { parseEnemies } from '../src/world/spawns';
import { FLOOR, roomOf } from './helpers';

const ROOM = roomOf({ 22: FLOOR, 14: '='.repeat(40) });
const center = (b: { x: number; w: number }) => b.x + b.w / 2;
const guard = (x = 20, patrol: [number, number] = [8, 32]) => createGuard('r#e0', { kind: 'guard', x, bottom: 22, patrol });
const ninaAt = (x: number, bottom = 22, room = ROOM): Nina => {
  const n = createNina(x - NINA.w / 2, bottom);
  for (let i = 0; i < 3; i++) updateNina(n, IDLE, room, DT);
  return n;
};
// Шаги охранника до первой пули (не дольше s секунд): пуля и прошедшее время.
const untilShot = (gd: Guard, n: Nina, room: Room = ROOM, s = 3) => {
  let t = 0;
  let p: Projectile | null = null;
  while (!p && t < s) {
    p = updateGuard(gd, n, room, DT);
    t += DT;
  }
  return { p, t };
};
// Пуля летит, пока не попадёт в n или не погибнет.
const flies = (p: Projectile, n: Nina, room: Room = ROOM) => {
  for (let i = 0; i < 120 && p.alive; i++) {
    stepProjectiles([p], room, DT);
    if (projectileHit(p, bodyRect(n.body))) return true;
  }
  return false;
};

describe('охранник: шапка и патруль', () => {
  it('guard@x,низ patrol=a..b', () => {
    expect(parseEnemies('guard@12,22 patrol=8..20', 'a')).toEqual([{ kind: 'guard', x: 12, bottom: 22, patrol: [8, 20] }]);
    expect(() => parseEnemies('guard@12,22', 'r')).toThrow('r: у охранника нет patrol=a..b');
  });

  it('патрулирует свой участок, не видя героиню', () => {
    const gd = guard(20, [12, 28]);
    const n = ninaAt(2, 14);
    let turned = false;
    for (let i = 0; i < 60 * 20; i++) {
      const f = gd.facing;
      updateGuard(gd, n, ROOM, DT);
      if (gd.facing !== f) turned = true;
      expect(center(gd.body)).toBeGreaterThanOrEqual(12 - 1e-6);
      expect(center(gd.body)).toBeLessThanOrEqual(28 + 1e-6);
    }
    expect(turned).toBe(true);
  });
});

describe('охранник: видимость', () => {
  it('на своём этаже — на всю комнату; на другом этаже и за стеной или закрытой дверью — нет', () => {
    const gd = guard(3, [2, 5]);
    expect(guardSees(gd, ninaAt(38), ROOM)).toBe(true);
    expect(guardSees(gd, ninaAt(38, 14), ROOM)).toBe(false);
    const wall = roomOf({ 22: FLOOR, 19: '.'.repeat(20) + '#' });
    expect(guardSees(gd, ninaAt(38, 22, wall), wall)).toBe(false);
    const door = { ...roomOf({ 22: FLOOR, 19: '.'.repeat(20) + '1' }), id: 'd' };
    expect(guardSees(gd, ninaAt(38, 22, door), solidRoom(door, new Set()))).toBe(false);
    expect(guardSees(gd, ninaAt(38, 22, door), solidRoom(door, new Set(['d#1'])))).toBe(true);
  });
});

describe('охранник: выстрел', () => {
  it('увидел — стоит и целится 0.5 с, потом пуля: прямо, на высоте груди, 30 клеток/с, урон 25', () => {
    const gd = guard(10);
    const n = ninaAt(30);
    const { p, t } = untilShot(gd, n);
    expect(t).toBeGreaterThanOrEqual(GUARD.aim - 1e-9);
    expect(t).toBeLessThan(GUARD.aim + 3 * DT);
    expect(p).toMatchObject({ kind: 'bullet', from: 'enemy', vx: GUARD.bulletSpeed, vy: 0, damage: GUARD.bulletDamage });
    expect(p!.y).toBeCloseTo(22 - GUARD.chest);
  });

  it('перезарядка 1.5 с между выстрелами', () => {
    const gd = guard(10);
    const n = ninaAt(30);
    untilShot(gd, n);
    const { t } = untilShot(gd, n);
    expect(t).toBeGreaterThanOrEqual(GUARD.reload + GUARD.aim - 1e-9);
    expect(t).toBeLessThan(GUARD.reload + GUARD.aim + 4 * DT);
  });

  it('стоя — пуля попадает; присев — пролетает над головой', () => {
    const stand = ninaAt(30);
    expect(flies(untilShot(guard(10), stand).p!, stand)).toBe(true);
    const low = ninaAt(30);
    for (let i = 0; i < 3; i++) updateNina(low, { ...IDLE, down: true }, ROOM, DT);
    expect(low.crouching).toBe(true);
    expect(flies(untilShot(guard(10), low).p!, low)).toBe(false);
  });

  it('прыжок уводит из линии: в верхней точке пуля проходит под ногами', () => {
    const n = ninaAt(30);
    const p = untilShot(guard(10), n).p!;
    n.body.y -= NINA.jumpHeight; // героиня в верхней точке прыжка
    expect(flies(p, n)).toBe(false);
  });

  it('пуля гаснет о стену и о закрытую дверь', () => {
    const door = { ...roomOf({ 22: FLOOR, 19: '.'.repeat(20) + '1' }), id: 'd' };
    const solid = solidRoom(door, new Set());
    const p: Projectile = { kind: 'bullet', x: 12, y: 19.4, vx: GUARD.bulletSpeed, vy: 0, from: 'enemy', damage: GUARD.bulletDamage, alive: true, hitWall: false };
    for (let i = 0; i < 60 && p.alive; i++) stepProjectiles([p], solid, DT);
    expect(p.alive).toBe(false);
    expect(p.hitWall).toBe(true);
    expect(p.x).toBeLessThan(21);
  });

  it('попадание пули: −25 энергии и оглушение, как от удара', () => {
    const n = ninaAt(30);
    const p: Projectile = { kind: 'bullet', x: 29.5, y: 22 - GUARD.chest, vx: GUARD.bulletSpeed, vy: 0, from: 'enemy', damage: GUARD.bulletDamage, alive: true, hitWall: false };
    resolveCombat(n, [], [p], ROOM);
    expect(n.energy).toBe(NINA.energyMax - GUARD.bulletDamage);
    expect(n.hurtT).toBeCloseTo(COMBAT.hurtStun);
    expect(p.alive).toBe(false);
  });
});

describe('охранник: ближний бой', () => {
  it('героиня ближе 2 клеток — шаг назад, потом выстрел', () => {
    const gd = guard(20);
    const n = ninaAt(21.5);
    const x0 = center(gd.body);
    updateGuard(gd, n, ROOM, DT);
    expect(gd.state).toBe('back');
    const { p } = untilShot(gd, n);
    expect(p).not.toBeNull();
    expect(x0 - center(gd.body)).toBeCloseTo(GUARD.backStep, 1);
    expect(gd.facing).toBe(1); // отступает, не отворачиваясь
  });

  it('упёрся в стену — стреляет на месте', () => {
    const wall = roomOf({ 22: FLOOR, 18: '#', 19: '#', 20: '#', 21: '#' });
    const gd = guard(1.6, [1.6, 10]);
    const n = ninaAt(3, 22, wall);
    const x0 = center(gd.body);
    const { p, t } = untilShot(gd, n, wall);
    expect(p).not.toBeNull();
    expect(center(gd.body)).toBeCloseTo(x0);
    expect(t).toBeLessThan(GUARD.aim + 4 * DT);
  });
});

describe('охранник: урон', () => {
  it('2 попадания — выведен; между попаданиями неуязвим', () => {
    const gd = guard();
    expect(hitGuard(gd, 1, 1)).toBe('hit');
    expect(hitGuard(gd, 1, 1)).toBe('blocked');
    gd.invulnT = 0;
    expect(hitGuard(gd, 1, 1)).toBe('killed');
    expect(updateGuard(gd, ninaAt(30), ROOM, DT)).toBeNull();
  });

  it('удар героини и брошенный нож попадают через resolveGuards', () => {
    const gd = guard(20);
    const n = ninaAt(18.4);
    n.attack = { kind: 'punch', t: COMBAT.punch.windup, hits: [] };
    const knife: Projectile = { kind: 'knife', x: 20, y: 20, vx: 10, vy: 0, from: 'nina', damage: 1, alive: true, hitWall: false };
    const events: { id: string; result: string }[] = [];
    expect(resolveGuards(n, [gd], [knife], events as never)).toEqual([]);
    expect(events).toEqual([{ id: 'r#e0', result: 'hit' }, { id: 'r#e0', result: 'blocked' }]);
  });
});

describe('охранник в игре', () => {
  const R = (meta: Record<string, string>): Map<string, Room> => new Map([['a', { ...roomOf({ 22: FLOOR }), id: 'a', meta }]]);
  const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
  const hold = (g: Game, p: Partial<Intent>, s: number) => { for (let i = 0; i < Math.round(s / DT); i++) stepGame(g, I(p), DT); };

  it('щелчок aim, выстрел shot, героиня теряет 25 энергии', () => {
    const g = createGame(R({ enemies: 'guard@6,22 patrol=4..10' }), { room: 'a', x: 30, bottom: 22 });
    g.sfx = [];
    hold(g, {}, 1.6); // прицел 0.5 с и 24 клетки полёта
    expect(g.sfx).toContain('aim');
    expect(g.sfx).toContain('shot');
    expect(g.sfx.indexOf('aim')).toBeLessThan(g.sfx.indexOf('shot'));
    expect(g.nina.energy).toBeLessThan(NINA.energyMax - GUARD.bulletDamage + 2); // + отдых стоя
    expect(g.mission.hits).toBe(1);
  });

  it('по тревоге идёт к героине, которую не видит', () => {
    const rows: Record<number, string> = { 22: FLOOR, 14: '='.repeat(40) };
    const g = createGame(new Map([['a', { ...roomOf(rows), id: 'a', meta: { enemies: 'guard@10,14 patrol=4..36' } }]]), { room: 'a', x: 30, bottom: 22 });
    hold(g, {}, 0.1);
    const x0 = center(g.guards[0].body);
    g.guards[0].facing = -1;
    g.alarmT = 5;
    hold(g, {}, 1);
    expect(g.guards[0].state).toBe('chase');
    expect(center(g.guards[0].body)).toBeGreaterThan(x0 + 2);
  });

  it('убитый рассыпается, считается в attacks и не возвращается', () => {
    const g = createGame(R({ enemies: 'guard@20,22 patrol=8..32' }), { room: 'a', x: 2, bottom: 22 });
    const gd = g.guards[0];
    gd.hp = 1;
    gd.state = 'reload';
    g.projectiles.push({ kind: 'knife', x: 20, y: 20, vx: 1, vy: 0, from: 'nina', damage: 1, alive: true, hitWall: false });
    hold(g, {}, DT);
    expect(gd.gone).toBe(true);
    expect(g.mission.attacks).toBe(1);
    expect(g.particles.length).toBeGreaterThan(10);
    expect(g.killed.has(gd.id)).toBe(true);
  });

  it('рисуется в слое фигур: зелёный, голова «o», ружьё «—»', () => {
    const g = createGame(R({ enemies: 'guard@20,22 patrol=8..32' }), { room: 'a', x: 2, bottom: 22 });
    const fig: { ch: string; c: readonly number[] }[] = [];
    drawGame({ push: () => {}, text: () => {} } as never, g, 1, { push: (_x, _y, ch, c) => { if (c === PAL.guard) fig.push({ ch, c }); } });
    expect(fig.filter(p => p.ch === 'o')).toHaveLength(1);
    expect(fig.filter(p => p.ch === '—')).toHaveLength(GUARD.gun);
    for (const p of fig) expect(CHARSET).toContain(p.ch);
  });
});
