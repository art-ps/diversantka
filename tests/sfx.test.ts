import { expect, it } from 'vitest';
import { DT, NINA, SFX } from '../src/config';
import { createGame, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { SFX_KINDS, type Sfx } from '../src/sim/sfx';
import type { Room } from '../src/world/room';
import { FLOOR, roomOf } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const R = (rows: Record<number, string>, meta: Record<string, string> = {}): Room => ({ ...roomOf({ 22: FLOOR, ...rows }), id: 'a', meta });
const game = (room: Room, x = 4, bottom = 22) => createGame(new Map([['a', room]]), { room: 'a', x, bottom });
// Шаги с нажатием в первом кадре; возвращает звуки за эти шаги (g.sfx очищается, как в main.ts).
const sounds = (g: Game, p: Partial<Intent>, n: number): Sfx[] => {
  g.sfx.length = 0;
  for (let i = 0; i < n; i++) stepGame(g, I(i === 0 ? p : { ...p, jumpPressed: false, attackPressed: false, throwPressed: false, usePressed: false }), DT);
  return [...g.sfx];
};
const count = (s: Sfx[], k: Sfx) => s.filter(x => x === k).length;
const settle = (g: Game) => sounds(g, {}, 10);

it('список звуков без повторов; стоя на месте — тишина', () => {
  expect(new Set(SFX_KINDS).size).toBe(SFX_KINDS.length);
  const g = game(R({}));
  settle(g);
  expect(sounds(g, {}, 120)).toEqual([]);
});

it('шаги по полу: звук на каждые SFX.stride клеток пути, не каждый кадр', () => {
  const g = game(R({}));
  settle(g);
  const x0 = g.nina.body.x;
  const s = sounds(g, { moveX: 1 }, 100);
  const run = g.nina.body.x - x0;
  expect(count(s, 'stepFloor')).toBe(Math.floor(run / SFX.stride));
  expect(count(s, 'stepFloor')).toBeLessThan(100 / 5);
  expect(s.every(k => k === 'stepFloor')).toBe(true);
});

it('вода: всплеск один раз при входе, дальше шаги по воде', () => {
  const g = game(R({ 21: '..........' + '~'.repeat(30) }), 2);
  settle(g);
  const s = sounds(g, { moveX: 1 }, 120);
  expect(count(s, 'splash')).toBe(1);
  expect(count(s, 'stepWater')).toBeGreaterThan(2);
  expect(s.indexOf('splash')).toBeLessThan(s.indexOf('stepWater'));
});

it('лестница: ступеньки через SFX.ladderStride клеток подъёма', () => {
  const rows: Record<number, string> = { 10: '#'.repeat(20) + 'H' + '#'.repeat(19) };
  for (let r = 11; r <= 21; r++) rows[r] = '.'.repeat(20) + 'H';
  const g = game(R(rows), 20.5 - NINA.w / 2);
  settle(g);
  const y0 = g.nina.body.y;
  const s = sounds(g, { up: true }, 60);
  expect(g.nina.state).toBe('ladder');
  expect(count(s, 'stepLadder')).toBe(Math.floor((y0 - g.nina.body.y) / SFX.ladderStride));
});

it('прыжок и приземление — по одному разу; в воздухе шагов нет', () => {
  const g = game(R({}));
  settle(g);
  const s = sounds(g, { moveX: 1, jump: true, jumpPressed: true }, 50);
  expect(count(s, 'jump')).toBe(1);
  expect(count(s, 'land')).toBe(1);
  const air = s.slice(s.indexOf('jump'), s.indexOf('land'));
  expect(air.filter(k => k === 'stepFloor')).toEqual([]);
});

it('приземление: с высоты больше safeFall — тяжёлое; меньше SFX.landMin — без звука', () => {
  const high = game(R({}), 4, 22 - NINA.safeFall - 3);
  expect(sounds(high, {}, 60)).toContain('landHard');
  const low = game(R({}), 4, 22 - SFX.landMin / 2);
  const s = sounds(low, {}, 30);
  expect(s).not.toContain('land');
  expect(s).not.toContain('landHard');
});

it('удар рукой, ногой (вверх+удар) и в прыжке — звук в кадр начала удара', () => {
  const g = game(R({}));
  settle(g);
  expect(sounds(g, { attackPressed: true }, 1)).toEqual(['punch']);
  sounds(g, {}, 30);
  expect(sounds(g, { up: true, attackPressed: true }, 1)).toEqual(['kick']);
  sounds(g, {}, 40);
  sounds(g, { jump: true, jumpPressed: true }, 5);
  expect(sounds(g, { jump: true, attackPressed: true }, 1)).toEqual(['kick']);
});

it('попадание по андроиду, блок в неуязвимости, гибель собаки', () => {
  const g = game(R({}, { enemies: 'android@20,22 patrol=19..21' }), 18.3 - NINA.w / 2);
  settle(g);
  g.nina.facing = 1;
  const s = sounds(g, { attackPressed: true }, 20);
  expect(s).toContain('hit');
  g.nina.attack = null;
  g.androids[0].invulnT = 1;
  expect(sounds(g, { attackPressed: true }, 20)).toContain('block');
  const d = game(R({}, { enemies: 'dog@30,22 patrol=28..32' }));
  settle(d);
  const dog = d.dogs[0];
  d.projectiles.push({ kind: 'stone', x: dog.body.x + 0.8, y: dog.body.y + 0.7, vx: 0.1, vy: 0, from: 'nina', damage: 1, alive: true, hitWall: false });
  expect(sounds(d, {}, 1)).toContain('kill');
});

it('укус собаки: укус и урон героине', () => {
  const g = game(R({}, { enemies: 'dog@10,22 patrol=6..24' }), 15);
  const s = sounds(g, {}, 120);
  expect(count(s, 'bite')).toBeGreaterThanOrEqual(1);
  expect(s).toContain('hurt');
});

it('шипы: урон; последний удар — гибель, ровно один раз', () => {
  const g = game(R({ 21: '..........^' }));
  settle(g);
  g.nina.energy = 1;
  const s = sounds(g, { moveX: 1 }, 120);
  expect(s).toContain('hurt');
  expect(count(s, 'death')).toBe(1);
  expect(g.nina.dead).toBe(true);
});

it('подбор предмета, лента, источник', () => {
  const g = game(R({}, { items: 'knife@5,22', tapes: '12,22', source: '20,22' }));
  settle(g);
  expect(sounds(g, { throwPressed: true }, 1)).toEqual(['pickup']);
  const s = sounds(g, { moveX: 1 }, 90);
  expect(count(s, 'tape')).toBe(1);
  expect(count(s, 'source')).toBe(1);
});
