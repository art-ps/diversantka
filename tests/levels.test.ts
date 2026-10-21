import { expect, it } from 'vitest';
import { DT, MISSION } from '../src/config';
import { createGame } from '../src/game';
import { generateLevel } from '../src/gen/level';
import { missionDef, worldOf } from '../src/levels';
import { MISSIONS } from '../src/missions';
import { createMission, enterTapes, missionResult } from '../src/sim/mission';

it('missionDef: 1 и 2 — ручные, с 3-й — описание сгенерированного уровня', () => {
  expect(missionDef(1)).toBe(MISSIONS[1]);
  expect(missionDef(2)).toBe(MISSIONS[2]);
  expect(MISSIONS[1].tapes).toBe(MISSION.tapes);
  expect(MISSIONS[2].tapes).toBe(0);
  for (const n of [3, 4, 10]) expect(missionDef(n)).toEqual(generateLevel(n).def);
});

it('worldOf: один набор комнат на уровень за сессию; миссии 1–2 — файлы, с 3-й — генератор', () => {
  expect(worldOf(1)).toBe(worldOf(1));
  expect(worldOf(1).has('roof-1')).toBe(true);
  expect(worldOf(2).has('gate')).toBe(true);
  expect(worldOf(3)).toBe(worldOf(3));
  expect([...worldOf(3).keys()]).toEqual([...generateLevel(3).rooms.keys()]);
  expect(worldOf(3).has(missionDef(3).start.room)).toBe(true);
});

it('лент в миссии — из описания: ЭВМ принимает ровно tapesNeed, итог — n/tapesNeed', () => {
  const m = createMission({ room: 'a', x: 0, bottom: 22 }, 'tapes', 600, 4);
  expect(m.tapesNeed).toBe(4);
  for (const id of ['a#t0', 'b#t0', 'c#t0']) m.tapes.add(id);
  expect(enterTapes(m)).toContain('3/4');
  expect(m.tapesIn).toBe(false);
  m.tapes.add('d#t0');
  enterTapes(m);
  expect(m.tapesIn).toBe(true);
  expect(missionResult(m).tapes).toBe('4/4');
  expect(createMission({ room: 'a', x: 0, bottom: 22 }).tapesNeed).toBe(MISSION.tapes);
});

it('createGame на сгенерированном уровне берёт цель, таймер и ленты из missionDef', () => {
  const n = 4, d = missionDef(n);
  const g = createGame(worldOf(n), d.start, n);
  expect(g.missionId).toBe(n);
  expect(g.mission.goal).toBe(d.goal);
  expect(g.mission.timeLeft).toBe(d.time);
  expect(g.mission.tapesNeed).toBe(d.tapes);
  expect(DT).toBeGreaterThan(0);
});
