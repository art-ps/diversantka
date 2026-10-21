import { expect, it } from 'vitest';
import { BOMB, GEN } from '../src/config';
import {
  cameraChance, densityOf, doorCount, flamerChance, goalOf, guardWeight, kOf, loopsOf, maxGoalHops, roomsOf, tapesOf, timerOf,
} from '../src/gen/difficulty';

it('таблица сложности спеки: комнаты, двери, плотность врагов, ленты, петли', () => {
  expect([3, 4, 5, 6, 7, 8, 20, 23, 40].map(roomsOf)).toEqual([10, 11, 12, 13, 14, 15, 27, 30, 30]);
  expect([3, 4, 5, 7, 8, 30].map(doorCount)).toEqual([1, 1, 2, 2, 3, 3]);
  expect([3, 4, 5, 6, 7].map(n => densityOf(n).toFixed(1))).toEqual(['0.6', '0.7', '0.8', '0.9', '1.0']);
  expect(densityOf(17)).toBe(2);
  expect(densityOf(40)).toBe(2);
  expect([4, 6, 8, 10, 30].map(tapesOf)).toEqual([4, 5, 6, 6, 6]);
  expect([3, 5, 6, 9, 10, 15, 30].map(loopsOf)).toEqual([1, 1, 2, 2, 3, 4, 4]);
});

it('цель: нечётные — bomb, чётные — tapes', () => {
  expect([3, 4, 5, 10, 11, 20].map(goalOf)).toEqual(['bomb', 'tapes', 'bomb', 'tapes', 'bomb', 'tapes']);
});

it('что добавляется с уровнем: огнемёты с 4, охрана с 5, камеры с 6', () => {
  expect(flamerChance(3)).toBe(0);
  expect(flamerChance(4)).toBeGreaterThan(0);
  expect(guardWeight(4)).toBe(0);
  expect(guardWeight(5)).toBeGreaterThan(0);
  expect(guardWeight(30)).toBe(6);
  expect(cameraChance(5)).toBe(0);
  expect(cameraChance(6)).toBeGreaterThan(0);
  expect(flamerChance(40)).toBe(1);
  expect(cameraChance(40)).toBe(1);
});

it('таймер: k от 4.5 до 2.5, кратен 30 с, не меньше 5 минут; отход бомбы — 6 переходов', () => {
  expect(kOf(3)).toBe(4.5);
  expect(kOf(9)).toBeCloseTo(3.5);
  expect(kOf(15)).toBe(2.5);
  expect(kOf(40)).toBe(2.5);
  expect(timerOf(3, 0, 0)).toBe(GEN.minTime);
  expect(timerOf(15, 100, 10)).toBe(Math.ceil(((100 * GEN.roomSec + 10 * GEN.fightSec) * 2.5) / 30) * 30);
  expect(timerOf(3, 20, 5) % 30).toBe(0);
  expect(maxGoalHops).toBe(Math.floor((GEN.returnShare * BOMB.fuse) / GEN.roomSec));
  expect(maxGoalHops).toBe(6);
});
