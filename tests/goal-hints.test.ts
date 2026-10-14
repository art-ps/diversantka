import { describe, expect, it } from 'vitest';
import { DT, NINA } from '../src/config';
import { createArrival, createGame, createPrologue, plantHint, stepGame, type Game } from '../src/game';
import { STR } from '../src/i18n';
import { IDLE, type Intent } from '../src/input/intent';
import { MISSIONS } from '../src/missions';
import { PAL } from '../src/render/palette';
import { drawGame } from '../src/render/scene';
import type { Room } from '../src/world/room';
import { FLOOR, loadRoomsFs, roomOf } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const press = (g: Game, p: Partial<Intent>) => stepGame(g, I(p), DT);
const hold = (g: Game, n: number) => { for (let i = 0; i < n; i++) stepGame(g, I(), DT); };
const standAt = (g: Game, x: number) => {
  Object.assign(g.nina.body, { x: x - NINA.w / 2, y: 22 - NINA.h, vx: 0, vy: 0 });
  hold(g, 6);
};
const R = (id: string, meta: Record<string, string>): Room => ({ ...roomOf({ 22: FLOOR }), id, meta });
// Реакторная: бомба на полу у x = 6, точка закладки у x = 20, мотоцикл у x = 34.
const game = () => {
  const g = createGame(new Map([['a', R('a', { items: 'bomb@6,22', bomb: '20,22', bike: '34,22' })]]), { room: 'a', x: 10, bottom: 22 });
  g.mission.goal = 'bomb';
  hold(g, 6);
  return g;
};
const shot = (g: Game, time = 1) => {
  const pushes: { ch: string; c: readonly number[] }[] = [], texts: string[] = [];
  drawGame({
    push: (_x: number, _y: number, ch: string, c: readonly number[]) => { pushes.push({ ch, c }); },
    text: (_x: number, _y: number, s: string) => { texts.push(s); },
  } as never, g, time);
  return { pushes, texts };
};
const has = (g: Game, ch: string, times = [1]) => times.some(t => shot(g, t).pushes.some(p => p.ch === ch && p.c === PAL.danger));

describe('подсказки цели в комнате', () => {
  it('бомба не в руках: метка X, нет стрелки и подсказки', () => {
    const g = game();
    standAt(g, 10);
    expect(has(g, 'X')).toBe(true);
    expect(has(g, 'v', [0, 0.3])).toBe(false);
    expect(plantHint(g)).toBe(false);
    expect(shot(g).texts).not.toContain(STR.ru.plantHint);
  });

  it('бомба в руках, далеко: мигающая стрелка v, подсказки нет', () => {
    const g = game();
    g.nina.held = 'bomb';
    standAt(g, 10);
    expect(has(g, 'v', [0, 0.3])).toBe(true);
    expect(has(g, 'X')).toBe(true);
    expect(plantHint(g)).toBe(false);
    expect(shot(g).texts).not.toContain(STR.ru.plantHint);
  });

  it('бомба в руках у точки: подсказка есть; пауза и гибель её гасят', () => {
    const g = game();
    g.nina.held = 'bomb';
    standAt(g, 20);
    expect(plantHint(g)).toBe(true);
    expect(shot(g).texts).toContain(STR.ru.plantHint);
    g.paused = true;
    expect(plantHint(g)).toBe(false);
    g.paused = false;
    g.nina.dead = true;
    expect(plantHint(g)).toBe(false);
  });

  it('после закладки: нет X, нет v, нет подсказки', () => {
    const g = game();
    g.nina.held = 'bomb';
    standAt(g, 20);
    press(g, { usePressed: true });
    expect(g.mission.fuse).not.toBeNull();
    expect(has(g, 'X')).toBe(false);
    expect(has(g, 'v', [0, 0.3])).toBe(false);
    expect(plantHint(g)).toBe(false);
  });

  it('миссия 1: точек закладки нет, X не рисуется', () => {
    const g = createGame(loadRoomsFs(), MISSIONS[1].start);
    hold(g, 6);
    expect(g.bombSite).toBeNull();
    expect(has(g, 'X')).toBe(false);
  });
});

describe('задание в сцене приезда', () => {
  it('миссия 2: название и задание', () => {
    const g = createArrival(loadRoomsFs('rooms2'));
    const { texts } = shot(g);
    expect(texts).toContain(STR.ru.missionName[2]);
    expect(texts).toContain(STR.ru.goalBomb);
  });

  it('миссия 1, пролог: задания нет', () => {
    const g = createPrologue(loadRoomsFs());
    expect(shot(g).texts).not.toContain(STR.ru.goalBomb);
  });
});
