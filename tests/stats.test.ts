import { describe, expect, it } from 'vitest';
import { createArrival, createGame, startMission } from '../src/game';
import { createStatsSeen, statsEvents } from '../src/stats';
import { loadRoomsFs } from './helpers';

const START = { room: 'shaft-top', x: 10, bottom: 22 };
const start1 = { name: 'mission-start', data: { mission: 1 } };

describe('статистика Umami: события за кадр', () => {
  it('старт миссии 1 после пролога — одно событие, повторы пусты', () => {
    const g = startMission(1);
    const seen = createStatsSeen();
    expect(statsEvents(g, seen)).toEqual([]); // пролог идёт
    g.prologue = null;
    expect(statsEvents(g, seen)).toEqual([start1]);
    expect(statsEvents(g, seen)).toEqual([]);
  });

  it('пока идёт сцена приезда — старта нет, после неё есть', () => {
    const g = createArrival(loadRoomsFs('rooms2'), 2);
    const seen = createStatsSeen();
    expect(statsEvents(g, seen)).toEqual([]);
    g.arrival = null;
    expect(statsEvents(g, seen)).toEqual([{ name: 'mission-start', data: { mission: 2 } }]);
    expect(statsEvents(g, seen)).toEqual([]);
  });

  it('победа — одно mission-win', () => {
    const g = createGame(loadRoomsFs(), START);
    const seen = createStatsSeen();
    statsEvents(g, seen);
    g.mission.result = 'won';
    expect(statsEvents(g, seen)).toEqual([{ name: 'mission-win', data: { mission: 1 } }]);
    expect(statsEvents(g, seen)).toEqual([]);
  });

  it('гибель — одно mission-death, последующий провал не шлёт mission-fail', () => {
    const g = createGame(loadRoomsFs(), START);
    const seen = createStatsSeen();
    statsEvents(g, seen);
    g.nina.dead = true;
    expect(statsEvents(g, seen)).toEqual([{ name: 'mission-death', data: { mission: 1 } }]);
    g.mission.result = 'failed';
    expect(statsEvents(g, seen)).toEqual([]);
  });

  it('гибель и провал в одном кадре — только mission-death', () => {
    const g = createGame(loadRoomsFs(), START);
    const seen = createStatsSeen();
    statsEvents(g, seen);
    g.nina.dead = true;
    g.mission.result = 'failed';
    expect(statsEvents(g, seen)).toEqual([{ name: 'mission-death', data: { mission: 1 } }]);
  });

  it('время вышло без гибели — одно mission-fail', () => {
    const g = createGame(loadRoomsFs(), START);
    const seen = createStatsSeen();
    statsEvents(g, seen);
    g.mission.result = 'failed';
    expect(statsEvents(g, seen)).toEqual([{ name: 'mission-fail', data: { mission: 1 } }]);
    expect(statsEvents(g, seen)).toEqual([]);
  });

  it('новая игра после гибели — снова mission-start', () => {
    const rooms = loadRoomsFs();
    const g = createGame(rooms, START);
    const seen = createStatsSeen();
    statsEvents(g, seen);
    g.nina.dead = true;
    statsEvents(g, seen);
    Object.assign(g, createGame(rooms, START)); // как рестарт в main: те же g, новые mission и nina
    expect(statsEvents(g, seen)).toEqual([start1]);
    g.nina.dead = true;
    expect(statsEvents(g, seen)).toEqual([{ name: 'mission-death', data: { mission: 1 } }]);
  });
});
