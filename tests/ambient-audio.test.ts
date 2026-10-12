import { expect, it } from 'vitest';
import { AMBIENT, BEDS, DT, NINA, STORM, THUNDER } from '../src/config';
import { ambientOf, thunderEdge } from '../src/audio/ambient';
import { SoundEngine } from '../src/audio/engine';
import { flashAt } from '../src/fx/storm';
import { createGame, stepGame } from '../src/game';
import { IDLE } from '../src/input/intent';
import type { Room } from '../src/world/room';
import { AMBIENTS } from '../src/world/spawns';
import { fakeCtx } from './fake-audio';
import { FLOOR, roomOf } from './helpers';

const live = (f: ReturnType<typeof fakeCtx>['f']) => f.sources().filter(s => s.stopped === null);
// Время главного разряда первой вспышки цикла и кадр перед ним.
const strike = () => {
  let t = 0;
  while (flashAt(t).lit < AMBIENT.thunderLit) t += 1 / 60;
  return t;
};

it('гром — по разу на каждый главный разряд цикла вспышек', () => {
  let edges = 0, prev = 0;
  for (let i = 0; i < STORM.flashLoop * 60; i++) {
    const lit = flashAt(i / 60).lit;
    if (thunderEdge(prev, lit)) edges++;
    prev = lit;
  }
  expect(edges).toBe(5);
});

it('фоны тихие, у каждого места свой', () => {
  for (const a of AMBIENTS) {
    expect(BEDS[a].length, a).toBeGreaterThan(0);
    for (const t of BEDS[a]) expect(t.gain, a).toBeLessThanOrEqual(0.2);
  }
});

it('смена фона: старый гаснет за AMBIENT.fade, новый нарастает; тот же фон — ничего нового', () => {
  const { f, ctx } = fakeCtx();
  const e = new SoundEngine(ctx);
  e.update('hum', 0, 1 / 60);
  const hum = live(f);
  expect(hum).toHaveLength(BEDS.hum.length);
  e.update('hum', 0.1, 1 / 60);
  expect(f.sources()).toHaveLength(BEDS.hum.length);
  f.currentTime = 1;
  e.update('wind', 1, 1 / 60);
  for (const s of hum) expect(s.stopped).toBeCloseTo(1 + AMBIENT.fade);
  expect(e.ambience.kind).toBe('wind');
  expect(live(f).length).toBeGreaterThanOrEqual(BEDS.wind.length);
  e.update(null, 2, 1 / 60);
  expect(live(f)).toHaveLength(0);
});

it('гром в шторме — через AMBIENT.thunderDelay после разряда; не в шторме и без звука — нет', () => {
  const t = strike();
  for (const [kind, muted, want] of [['storm', false, THUNDER.length], ['hum', false, 0], ['storm', true, 0]] as const) {
    const { f, ctx } = fakeCtx();
    const e = new SoundEngine(ctx);
    e.setMuted(muted);
    e.update(kind, t - 1 / 60, 1 / 60);
    const before = f.sources().length;
    f.currentTime = 5;
    e.update(kind, t, 1 / 60);
    const fresh = f.sources().slice(before);
    expect(fresh, `${kind} ${muted}`).toHaveLength(want);
    for (const s of fresh) expect(s.started!).toBeGreaterThanOrEqual(5 + AMBIENT.thunderDelay);
  }
});

it('капель — только в пещере', () => {
  const { f, ctx } = fakeCtx();
  const e = new SoundEngine(ctx);
  e.update('hum', 0, 100); // вероятность за кадр > 1
  const n = f.sources().length;
  e.update('hum', 0, 100);
  expect(f.sources()).toHaveLength(n);
  e.update('drips', 0, 1 / 60);
  const m = f.sources().length;
  e.update('drips', 0, 100);
  expect(f.sources()).toHaveLength(m + 1);
});

it('фон — по комнате героини: сменился при переходе, вернулся при возрождении', () => {
  const R = (id: string, ambient: string, exits: Room['exits']): Room => ({ ...roomOf({ 22: FLOOR }, exits), id, meta: { ambient } });
  const g = createGame(new Map([['a', R('a', 'hum', { right: 'b' })], ['b', R('b', 'drips', { left: 'a' })]]), { room: 'a', x: 30, bottom: 22 });
  expect(ambientOf(g)).toBe('hum');
  for (let i = 0; i < 120 && g.roomId === 'a'; i++) stepGame(g, { ...IDLE, moveX: 1 }, DT);
  expect(ambientOf(g)).toBe('drips');
  for (let i = 0; i < 60 && g.transition; i++) stepGame(g, IDLE, DT);
  g.nina.dead = true;
  g.nina.deadT = NINA.respawnDelay;
  stepGame(g, { ...IDLE, jump: true, jumpPressed: true }, DT);
  expect(g.roomId).toBe('a');
  expect(ambientOf(g)).toBe('hum');
});
