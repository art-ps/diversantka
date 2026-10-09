import { expect, it } from 'vitest';
import { DT, LIFT, NINA } from '../src/config';
import { createGame, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { moveY, type Body } from '../src/sim/physics';
import type { Room } from '../src/world/room';
import { FLOOR, roomOf } from './helpers';

// Шахта в колонках 18..20: этажи — полы «a» в строках 10 и 22 (с проёмом) и пол «b» в строке 22 (47 = 25 + 22).
const GAP = '#'.repeat(18) + '...' + '#'.repeat(19);
const world = () => new Map<string, Room>([
  ['a', { ...roomOf({ 10: GAP, 22: GAP, 23: GAP, 24: GAP }, { down: 'b' }), id: 'a', meta: { lift: '18 10..47 floors=22' } }],
  ['b', { ...roomOf({ 0: GAP, 22: FLOOR }, { up: 'a' }), id: 'b' }],
]);
const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const run = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) stepGame(g, I(p), DT);
};
const bottom = (g: Game) => g.nina.body.y + g.nina.body.h;
// Героиня с центром x на этаже bottom комнаты room; платформа лифта — на этаже liftY.
const at = (room: string, bottom: number, x = 19.5, liftY = 10) => {
  const g = createGame(world(), { room, x: x - NINA.w / 2, bottom });
  g.lifts[0].y = liftY;
  run(g, {}, 5);
  return g;
};
const lift = (g: Game) => g.lifts[0];

it('moveY: платформа-опора держит сверху, если центр над ней; снизу и мимо — нет', () => {
  const room = roomOf({});
  const top = { x: 10, y: 12, w: 3, h: 1 };
  const b: Body = { x: 10.9, y: 7, w: 1.2, h: 4, vx: 0, vy: 0, onGround: false };
  expect(moveY(b, room, 2, { tops: [top] })).toBe(true);
  expect(b.y + b.h).toBe(12);
  expect(b.onGround).toBe(true);
  const side: Body = { ...b, x: 13.5, y: 7 };
  expect(moveY(side, room, 2, { tops: [top] })).toBe(false);
  const below: Body = { ...b, y: 9 };
  expect(moveY(below, room, -2, { tops: [top] })).toBe(false);
  expect(moveY(below, room, 0.5, { tops: [top] })).toBe(false); // ноги уже ниже верха — не опора
});

it('приёмка №8: лифт везёт стоящую героиню вниз и останавливается на следующем этаже', () => {
  const g = at('a', 10);
  expect(bottom(g)).toBeCloseTo(10);
  expect(g.nina.state).toBe('ground');
  run(g, { down: true }, 2);
  expect(lift(g).target).toBe(22);
  run(g, {}, 600, () => lift(g).target === null);
  run(g, {}, 30);
  expect(lift(g).y).toBe(22);
  expect(g.roomId).toBe('a');
  expect(bottom(g)).toBeCloseTo(22);
  expect(g.nina.state).toBe('ground');
  expect(g.nina.energy).toBe(NINA.energyMax);
});

it('удержание вниз: этаж за этажом, переход в комнату ниже — вместе с героиней', () => {
  const g = at('a', 10);
  let transitions = 0;
  for (let i = 0; i < 1200 && !(lift(g).y === 47 && lift(g).target === null); i++) {
    stepGame(g, I({ down: true }), DT);
    if (g.transition?.t === 0) transitions++;
  }
  run(g, {}, 30);
  expect(transitions).toBe(1);
  expect(g.roomId).toBe('b');
  expect(lift(g).y).toBe(47);
  expect(bottom(g)).toBeCloseTo(22);
  expect(g.nina.state).toBe('ground');
  expect(g.nina.energy).toBe(NINA.energyMax);
  // и обратно вверх — до этажа 22 комнаты «a»
  run(g, { up: true }, 900, () => g.roomId === 'a' && lift(g).target === null);
  run(g, {}, 30);
  expect(g.roomId).toBe('a');
  expect(lift(g).y).toBe(22);
  expect(bottom(g)).toBeCloseTo(22);
});

it('отпустила кнопку в пути — лифт доезжает до следующего этажа и стоит', () => {
  const g = at('a', 10);
  run(g, { down: true }, 3);
  run(g, {}, 600);
  expect(lift(g).y).toBe(22);
  expect(lift(g).target).toBeNull();
  expect(bottom(g)).toBeCloseTo(22);
});

it('после остановки по удержанию едет дальше не раньше LIFT.dwell', () => {
  const g = at('a', 10);
  run(g, { down: true }, 600, () => lift(g).y === 22);
  run(g, { down: true }, Math.floor(LIFT.dwell / DT) - 2);
  expect(lift(g).y).toBe(22);
  run(g, { down: true }, 10);
  expect(lift(g).y).toBeGreaterThan(22);
});

it('E на этаже без лифта — лифт приезжает; не у шахты и не на этаже — не вызывается', () => {
  const g = at('b', 22, 17);
  expect(lift(g).y).toBe(10);
  stepGame(g, I({ usePressed: true }), DT);
  expect(lift(g).target).toBe(47);
  run(g, {}, 900, () => lift(g).target === null);
  expect(lift(g).y).toBe(47);
  // на платформу — и вверх
  run(g, { moveX: 1 }, 200, () => g.nina.body.x + NINA.w / 2 >= 19.3);
  run(g, {}, 20);
  run(g, { up: true }, 2);
  expect(lift(g).target).toBe(22);
  const far = at('b', 22, 10);
  stepGame(far, I({ usePressed: true }), DT);
  expect(lift(far).target).toBeNull();
});

it('поднимаясь, платформа подхватывает падающую героиню, а не проходит сквозь неё', () => {
  const g = at('a', 22, 19.5, 22);
  expect(bottom(g)).toBeCloseTo(22);
  lift(g).target = 10;
  run(g, {}, 30);
  g.nina.body.y = lift(g).y - 0.05 - g.nina.body.h; // ноги чуть выше платформы, падает
  g.nina.body.vy = 0;
  g.nina.state = 'air';
  run(g, {}, 600, () => lift(g).target === null);
  run(g, {}, 10);
  expect(lift(g).y).toBe(10);
  expect(bottom(g)).toBeCloseTo(10);
  expect(g.nina.state).toBe('ground');
});

it('лежащий на платформе предмет едет вместе с ней', () => {
  const g = at('a', 10, 18.7);
  g.items.push({ id: 'a#x', kind: 'stone', x: 20, bottom: 10 });
  run(g, { down: true }, 2);
  run(g, {}, 600, () => lift(g).target === null);
  expect(g.items.find(i => i.id === 'a#x')!.bottom).toBe(22);
});

// Та же шахта, в «b» — терминал у x=10.
const withTerminal = () => {
  const w = world();
  w.set('b', { ...w.get('b')!, meta: { terminals: '10,22' } });
  return w;
};
const die = (g: Game) => {
  g.nina.dead = true;
  g.nina.deadT = NINA.respawnDelay;
  stepGame(g, I({ jump: true, jumpPressed: true }), DT);
};

it('смерть: лифт возвращается туда, где был при записи чекпоинта', () => {
  const g = createGame(withTerminal(), { room: 'b', x: 10 - NINA.w / 2, bottom: 22 });
  run(g, {}, 5);
  lift(g).y = 47;
  stepGame(g, I({ usePressed: true }), DT);
  expect(g.screen).not.toBeNull();
  expect(g.mission.checkpoint.lifts).toEqual({ a: 47 });
  g.screen = null;
  lift(g).y = 30;
  lift(g).target = 10;
  die(g);
  expect(lift(g)).toMatchObject({ y: 47, target: null });
});

it('лифт в пути при записи чекпоинта — записан этаж, куда он едет; до первого терминала — верхний этаж', () => {
  const g = createGame(withTerminal(), { room: 'b', x: 10 - NINA.w / 2, bottom: 22 });
  run(g, {}, 5);
  lift(g).target = 47;
  run(g, {}, 3);
  stepGame(g, I({ usePressed: true }), DT);
  expect(g.mission.checkpoint.lifts).toEqual({ a: 47 });
  const fresh = createGame(withTerminal(), { room: 'b', x: 10 - NINA.w / 2, bottom: 22 });
  lift(fresh).y = 47;
  die(fresh);
  expect(lift(fresh).y).toBe(10);
});

it('короткий прыжок на поднимающейся платформе: героиня остаётся на ней', () => {
  const g = at('a', 22, 19.5, 22);
  lift(g).target = 10;
  run(g, {}, 20);
  expect(lift(g).y).toBeLessThan(22);
  stepGame(g, I({ jump: true, jumpPressed: true }), DT);
  run(g, {}, 600, () => lift(g).target === null);
  run(g, {}, 30);
  expect(lift(g).y).toBe(10);
  expect(bottom(g)).toBeCloseTo(10);
  expect(g.nina.state).toBe('ground');
  expect(g.nina.energy).toBe(NINA.energyMax);
});

it('край платформы: героиня с центром у края едет вместе с лифтом, вниз и вверх через комнаты', () => {
  const g = at('a', 10, 18.2);
  run(g, { down: true }, 2);
  run(g, {}, 600, () => lift(g).target === null);
  run(g, {}, 30);
  expect(bottom(g)).toBeCloseTo(22);
  expect(g.nina.state).toBe('ground');
  const h = at('b', 22, 20.8, 47);
  expect(h.roomId).toBe('b');
  run(h, { up: true }, 1500, () => h.roomId === 'a' && lift(h).target === null);
  run(h, {}, 30);
  expect(h.roomId).toBe('a');
  expect(lift(h).y).toBe(22);
  expect(bottom(h)).toBeCloseTo(22);
  expect(h.nina.state).toBe('ground');
  expect(h.nina.energy).toBe(NINA.energyMax);
});
