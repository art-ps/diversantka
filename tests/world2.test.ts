import { expect, it } from 'vitest';
import { BUNKER_START, loadWorld, validateCameras, validateGates, validateMission } from '../src/world';
import type { Room } from '../src/world/room';
import { loadRoomsFs, roomOf } from './helpers';

// Набор комнат бункера (миссия 2) по мере раскладки.
const ROOMS2 = ['gate'];

const R = (id: string, rows: Record<number, string>, meta: Record<string, string>): Room => ({ ...roomOf(rows), id, meta });

it('loadWorld(2) — бункер: комнаты набора проходят все проверки; loadWorld() — по-прежнему база НИИ', () => {
  expect([...loadWorld(2).keys()].sort()).toEqual(ROOMS2);
  expect([...loadRoomsFs('rooms2').keys()].sort()).toEqual(ROOMS2);
  const base = loadWorld();
  expect(base.size).toBe(38);
  expect(base.has('gate')).toBe(false);
});

it('старт бункера — въезд gate, мотоцикл там же, левее старта', () => {
  const gate = loadRoomsFs('rooms2').get('gate')!;
  expect(BUNKER_START.room).toBe('gate');
  expect(gate.meta.bike).toBe('5,22');
  expect(BUNKER_START.bottom).toBe(22);
});

it('validateMission(bomb): одна точка закладки, одна бомба, мотоцикл в стартовой комнате; ленты не нужны', () => {
  expect(validateMission(new Map([['a', R('a', {}, {})]]), 'bomb', 'a')).toEqual([
    'точек закладки на карте 0, нужна одна',
    'бомб на карте 0, нужна одна',
    'мотоциклов на карте 0, нужен один',
  ]);
  const two = new Map([
    ['a', R('a', {}, { bomb: '3,22 ; 9,22', items: 'bomb@5,22 ; bomb@7,22', terminals: '12,22 controls=zz' })],
    ['b', R('b', {}, { bike: '4,22' })],
  ]);
  expect(validateMission(two, 'bomb', 'a')).toEqual([
    'a: терминал гасит огнемёты несуществующей комнаты zz',
    'точек закладки на карте 2, нужна одна',
    'бомб на карте 2, нужна одна',
    'мотоцикл в b, а нужен в стартовой комнате a',
  ]);
  const ok = new Map([['a', R('a', {}, { bomb: '3,22', items: 'bomb@5,22', bike: '30,22' })]]);
  expect(validateMission(ok, 'bomb', 'a')).toEqual([]);
  expect(validateMission(ok, 'tapes')).toContain('лент на карте 0, нужно 6'); // первая миссия — прежние требования
});

it('validateCameras: камера в двери или решётке — ошибка', () => {
  const rows = { 5: '..1..A..' };
  const room = (cam: string) => new Map([['a', R('a', rows, { cameras: `${cam} arc=-10..10 period=2` })]]);
  expect(validateCameras(room('2,5'))).toEqual(['a: камера 2,5 в двери или решётке']);
  expect(validateCameras(room('5,5'))).toEqual(['a: камера 5,5 в двери или решётке']);
  expect(validateCameras(room('3,5'))).toEqual([]);
});

it('validateGates: враг, чей участок заходит под решётку на высоте роста, — ошибка; этажом выше или в стороне — нет', () => {
  const rows: Record<number, string> = { 22: '#'.repeat(40) };
  for (let r = 18; r < 22; r++) rows[r] = '.'.repeat(20) + 'A';
  const room = (enemies: string) => new Map([['a', R('a', rows, { enemies })]]);
  expect(validateGates(room('guard@15,22 patrol=10..19.5'))).toEqual(['a: guard 10..19.5 ходит под решёткой 20']);
  expect(validateGates(room('dog@25,22 patrol=21.5..30'))).toEqual(['a: dog 21.5..30 ходит под решёткой 20']);
  expect(validateGates(room('android@12,22 patrol=8..18'))).toEqual([]);
  expect(validateGates(room('guard@20,14 patrol=15..25'))).toEqual([]);
  expect(validateGates(room('flamer@20,19 dir=left'))).toEqual([]);
});
