import { afterEach, expect, it } from 'vitest';
import { DT, MISSION } from '../src/config';
import { startMission, stepGame, type Game } from '../src/game';
import { setLang, STR } from '../src/i18n';
import { IDLE } from '../src/input/intent';
import { drawMap } from '../src/render/map';
import { createMission, missionResult, plantBomb, startBike } from '../src/sim/mission';

afterEach(() => setLang('ru'));

const mapTexts = (g: Game) => {
  const out: string[] = [];
  drawMap({ push: () => {}, text: (_x: number, _y: number, s: string) => { out.push(s); } } as never, g, 0.1);
  return out;
};

it('строка итога: миссия N, у лент — n/tapesNeed; миссии 1 и 2 — как раньше', () => {
  const at = { room: 'a', x: 0, bottom: 22 }, day = new Date(2026, 9, 21);
  const bomb = createMission(at, 'bomb', 600, 0);
  bomb.timeLeft = 600 - 552;
  bomb.hits = 4;
  bomb.attacks = 0;
  expect(missionResult(bomb, day, 7).line).toBe('Диверсантка · миссия 7 · 09:12 · ударов 4 · без боя');
  const tapes = createMission(at, 'tapes', 600, 5);
  for (const id of ['a', 'b', 'c', 'd', 'e']) tapes.tapes.add(id);
  tapes.timeLeft = 600 - 552;
  tapes.hits = 4;
  tapes.attacks = 2;
  expect(missionResult(tapes, day, 8).line).toBe('Диверсантка · миссия 8 · 09:12 · ленты 5/5 · ударов 4');
  setLang('en');
  expect(missionResult(bomb, day, 7).line).toBe('Diversantka · mission 7 · 09:12 · hits 4 · no fight');
  setLang('ru');
  expect(missionResult(bomb, day).line.startsWith('Диверсантка · бункер · ')).toBe(true);
  expect(STR.ru.resultLine('12:54', '6/6', 3, ['noFight'])).toBe('Диверсантка · 12:54 · ленты 6/6 · ударов 3 · без боя');
});

it('легенда карты: сгенерированный с бомбой — «Р ПОДРЫВ», с лентами — легенда миссии 1; шаг задания — сверху', () => {
  const b = startMission(3);
  for (let i = 0; i < Math.round(MISSION.arriveTime / DT) + 1; i++) stepGame(b, IDLE, DT);
  expect(mapTexts(b)).toEqual(expect.arrayContaining([STR.ru.mapLegendGen, STR.ru.goalPlant]));
  const t = startMission(4);
  for (let i = 0; i < Math.round(MISSION.arriveTime / DT) + 1; i++) stepGame(t, IDLE, DT);
  expect(mapTexts(t)).toEqual(expect.arrayContaining([STR.ru.mapLegend, STR.ru.goalTapes(t.mission.tapesNeed)]));
  expect(STR.en.mapLegendGen).toBe('T TERMINAL  G GARAGE  R RIG');
});

it('итог в игре: строка клипа называет номер миссии (уровень 3)', () => {
  const g = startMission(3);
  for (let i = 0; i < Math.round(MISSION.arriveTime / DT) + 1; i++) stepGame(g, IDLE, DT);
  plantBomb(g.mission);
  expect(startBike(g.mission)).toBe(true);
  for (let i = 0; i < Math.ceil(MISSION.outroTime / DT) + 2; i++) stepGame(g, IDLE, DT);
  expect(g.mission.result).toBe('won');
  stepGame(g, { ...IDLE, usePressed: true }, DT);
  expect(g.clip).toContain('миссия 3');
});
