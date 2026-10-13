import { describe, expect, it } from 'vitest';
import { DT, MISSION, NINA } from '../src/config';
import { createGame, liveRoom, stepGame, type Game } from '../src/game';
import { STR } from '../src/i18n';
import { IDLE, type Intent } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { PAL } from '../src/render/palette';
import { drawRoom } from '../src/render/scene';
import { doorsOf, solidRoom } from '../src/sim/doors';
import { stepProjectiles, type Projectile } from '../src/sim/items';
import { validateDoors } from '../src/world';
import { parseRoom, type Room } from '../src/world/room';
import { parseItems } from '../src/world/spawns';
import { FLOOR, roomOf } from './helpers';
import { doorRoute, routeDamage } from './reach';

// Пол — строка 22; в колонке x стена до строки 17 и дверь n в строках 18–21 — проём от пола до стены.
const doorRows = (n: string, x = 20): Record<number, string> => {
  const rows: Record<number, string> = { 22: FLOOR };
  for (let r = 1; r < 22; r++) rows[r] = '.'.repeat(x) + (r < 18 ? '#' : n);
  return rows;
};
const R = (id: string, rows: Record<number, string>, meta: Record<string, string> = {}, exits: Room['exits'] = {}): Room => ({ ...roomOf(rows, exits), id, meta });
const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const press = (g: Game, p: Partial<Intent>) => stepGame(g, I(p), DT);
const wait = (g: Game, s: number) => { for (let i = 0; i < Math.round(s / DT); i++) stepGame(g, IDLE, DT); };
const walk = (g: Game, dir: 1 | -1, s: number) => { for (let i = 0; i < Math.round(s / DT); i++) stepGame(g, I({ moveX: dir }), DT); };
// Перенести героиню на пол под x (центр тела); предмет в руках остаётся.
const standAt = (g: Game, x: number) => {
  Object.assign(g.nina.body, { x: x - NINA.w / 2, y: 22 - NINA.h, vx: 0, vy: 0 });
  wait(g, 0.1);
};
const right = (g: Game) => g.nina.body.x + g.nina.body.w;

// Комната a: ключ 1 на полу слева, дверь 1 в колонке 20, терминал у старта.
const world = (key = 'key1@10,22') => new Map([['a', R('a', doorRows('1'), { items: key, terminals: '4,22' })]]);

describe('двери: разбор и валидация', () => {
  it('тайлы 1–3 в сетке; дверь — непрерывный столбец своего номера', () => {
    const text = ['id: a', 'exits:', '---', ...Array.from({ length: 25 }, (_, r) => (r === 5 ? '..1..2' : r === 6 ? '..1..3' : '').padEnd(40, '.'))].join('\n');
    expect(doorsOf(parseRoom(text, 'a.txt'))).toEqual([
      { n: 1, x: 2, top: 5, bottom: 7 },
      { n: 2, x: 5, top: 5, bottom: 6 },
      { n: 3, x: 5, top: 6, bottom: 7 },
    ]);
  });

  it('ключи key1–key3 — предметы', () => {
    expect(parseItems('key1@6,22 ; key3@8,14', 'a').map(i => i.kind)).toEqual(['key1', 'key3']);
  });

  it('на номер — одна дверь и один ключ; дверь без ключа и ключ без двери — ошибки', () => {
    expect(validateDoors(world())).toEqual([]);
    expect(validateDoors(new Map([['a', R('a', doorRows('1'))]]))).toEqual(['у двери 1 нет ключа']);
    expect(validateDoors(new Map([['a', R('a', { 22: FLOOR }, { items: 'key2@3,22' })]]))).toEqual(['ключ 2 без двери']);
    const two = new Map([['a', R('a', doorRows('1'), { items: 'key1@3,22 ; key1@5,22' })], ['b', R('b', doorRows('1'))]]);
    expect(validateDoors(two)).toEqual(['дверей 1 на карте 2, нужна одна', 'ключей 1 на карте 2, нужен один']);
  });

  it('дверь — от пола до стены: щель сверху или снизу — ошибка', () => {
    const gap = doorRows('1');
    gap[17] = '.'.repeat(20) + '.'; // над дверью проход
    expect(validateDoors(new Map([['a', R('a', gap, { items: 'key1@3,22' })]]))).toEqual(['a: дверь 1 не закрывает проём от пола до стены']);
  });

  it('solidRoom: закрытая дверь — стена, открытая — фон; комната без дверей — та же', () => {
    const r = R('a', doorRows('1'));
    expect(solidRoom(r, new Set()).tiles[18][20]).toBe('#');
    expect(solidRoom(r, new Set(['a#1'])).tiles[18][20]).toBe('.');
    const plain = R('b', { 22: FLOOR });
    expect(solidRoom(plain, new Set())).toBe(plain);
  });
});

describe('двери в игре', () => {
  it('без ключа: E — «НУЖЕН КЛЮЧ 1», дверь держит героиню', () => {
    const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
    standAt(g, 19.3);
    press(g, { usePressed: true });
    expect(g.floaters.map(f => f.text)).toContain(STR.ru.needKey(1));
    expect(g.mission.doorsOpen.size).toBe(0);
    walk(g, 1, 1);
    expect(right(g)).toBeLessThanOrEqual(20 + 1e-6);
  });

  it('чужой ключ не открывает', () => {
    const g = createGame(new Map([['a', R('a', doorRows('1'), { items: 'key2@10,22' })]]), { room: 'a', x: 2, bottom: 22 });
    standAt(g, 10);
    press(g, { throwPressed: true });
    expect(g.nina.held).toBe('key2');
    standAt(g, 19.3);
    press(g, { usePressed: true });
    expect(g.mission.doorsOpen.size).toBe(0);
    expect(g.nina.held).toBe('key2');
    expect(g.floaters.map(f => f.text)).toContain(STR.ru.needKey(1));
  });

  it('брошенный нож гаснет о закрытую дверь; после открытия пролетает', () => {
    const r = R('a', doorRows('1'));
    const knife = (): Projectile => ({ kind: 'knife', x: 15, y: 19.5, vx: 20, vy: 0, from: 'nina', damage: 1, alive: true, hitWall: false });
    const fly = (room: Room) => {
      const p = knife();
      for (let i = 0; i < 60 && p.alive; i++) stepProjectiles([p], room, DT);
      return p;
    };
    const shut = fly(solidRoom(r, new Set()));
    expect(shut.alive).toBe(false);
    expect(shut.x).toBeLessThan(21);
    expect(fly(solidRoom(r, new Set(['a#1']))).x).toBeGreaterThan(21);
  });

  it('ключ нельзя бросить: K с ключом в руках — ключ остаётся, снарядов нет', () => {
    const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
    standAt(g, 10);
    press(g, { throwPressed: true });
    expect(g.nina.held).toBe('key1');
    press(g, { throwPressed: true });
    press(g, { throwPressed: true, up: true });
    expect(g.nina.held).toBe('key1');
    expect(g.projectiles).toEqual([]);
  });

  it('ключ 1 в руках, E у двери 1 — дверь открыта, ключ потрачен, звук door, проход свободен', () => {
    const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
    standAt(g, 10);
    press(g, { throwPressed: true });
    expect(g.nina.held).toBe('key1');
    standAt(g, 19.3);
    g.sfx = [];
    press(g, { usePressed: true });
    expect([...g.mission.doorsOpen]).toEqual(['a#1']);
    expect(g.nina.held).toBeNull();
    expect(g.sfx.filter(s => s === 'door')).toHaveLength(1);
    wait(g, 0.5);
    expect(g.sfx.filter(s => s === 'door')).toHaveLength(1);
    expect(liveRoom(g).tiles[20][20]).toBe('.');
    walk(g, 1, 1);
    expect(g.nina.body.x).toBeGreaterThan(21);
  });

  it('гибель и чекпоинт: открытая дверь остаётся открытой, потраченный ключ не возвращается', () => {
    const g = createGame(world(), { room: 'a', x: 2, bottom: 22 });
    standAt(g, 4);
    press(g, { usePressed: true }); // терминал — чекпоинт до открытия двери
    wait(g, MISSION.bootTime);
    press(g, { jumpPressed: true, jump: true }); // ВЫХОД
    expect(g.screen).toBeNull();
    standAt(g, 10);
    press(g, { throwPressed: true });
    standAt(g, 19.3);
    press(g, { usePressed: true });
    g.nina.dead = true;
    g.nina.deadT = NINA.respawnDelay;
    press(g, { jumpPressed: true, jump: true });
    expect(g.nina.dead).toBe(false);
    expect(g.nina.body.x + NINA.w / 2).toBeCloseTo(4);
    expect(g.mission.doorsOpen.has('a#1')).toBe(true);
    expect(g.items.filter(i => i.kind === 'key1')).toEqual([]);
    expect(g.nina.held).toBeNull();
  });
});

describe('рукопашная и закрытая дверь', () => {
  // Враг вплотную за дверью 1 (колонка 20), стоит на месте; героиня вплотную перед дверью.
  const fight = (enemy: string) => {
    const g = createGame(new Map([['a', R('a', doorRows('1'), { enemies: `${enemy}@21.6,22 patrol=21.6..21.7` })]]), { room: 'a', x: 2, bottom: 22 });
    standAt(g, 19.3);
    return g;
  };
  const strike = (g: Game) => { press(g, { attackPressed: true }); wait(g, 0.7); };

  it('андроид за закрытой дверью не видит и не бьёт героиню', () => {
    const g = fight('android');
    wait(g, 3);
    expect(g.nina.energy).toBe(NINA.energyMax);
    expect(g.androids[0].state).toBe('patrol');
  });

  it('удары героини через закрытую дверь не ранят охранника; после открытия — ранят', () => {
    const g = fight('guard');
    for (let i = 0; i < 3; i++) strike(g);
    expect(g.guards[0].hp).toBe(2);
    g.mission.doorsOpen.add('a#1');
    strike(g);
    expect(g.guards[0].hp).toBe(1);
  });
});

describe('достижимость с дверями', () => {
  const START = [{ room: 'a', x: 2, bottom: 22 }];
  const beyond = (d: Map<string, number>) => [...d.keys()].some(k => k.startsWith('S|a|') && Number(k.split('|')[2]) > 21);

  it('закрытая дверь — стена; открытая — проход', () => {
    expect(beyond(routeDamage(world(), START))).toBe(false);
    expect(beyond(routeDamage(world(), START, new Set([1])))).toBe(true);
  });

  it('путь «ключ → дверь» по номерам: ключ 2 за дверью 1 — достижим; ключ 1 за своей дверью — нет', () => {
    const rows = doorRows('1', 20);
    for (let r = 1; r < 22; r++) rows[r] = rows[r].padEnd(30, '.') + (r < 18 ? '#' : '2');
    const rooms = new Map([['a', R('a', rows, { items: 'key1@10,22 ; key2@25,22' })]]);
    expect(doorRoute(rooms, START)).toEqual([]);
    expect(doorRoute(world('key1@25,22'), START)).toEqual(['ключ 1']);
  });
});

describe('рисунок двери', () => {
  const draw = (open: ReadonlySet<string>) => {
    const out: { ch: string; c: readonly number[] }[] = [];
    drawRoom({ push: (x, y, ch, c) => { if (Math.floor(x + 0.5) === 20 && Math.floor(y + 0.5) >= 18 && Math.floor(y + 0.5) <= 21) out.push({ ch, c }); } }, R('a', doorRows('1')), 0, 0, 0, 'a', open);
    return out;
  };

  it('закрытая — столбцы «|» и «#» цветом двери; открытая — тусклая рамка «+»/«-»', () => {
    const shut = draw(new Set());
    expect(new Set(shut.map(p => p.ch))).toEqual(new Set(['|', '#']));
    expect(shut.every(p => p.c === PAL.door[0])).toBe(true);
    const open = draw(new Set(['a#1']));
    expect(open.map(p => p.ch).sort()).toEqual(['+', '+', '-', '-']);
    expect(open.every(p => p.c[1] < PAL.door[0][1])).toBe(true);
    for (const p of [...shut, ...open]) expect(CHARSET).toContain(p.ch);
  });
});
