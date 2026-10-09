import { expect, it } from 'vitest';
import { ROOM_H, ROOM_W } from '../src/config';
import { hudCell, hudWidth } from '../src/render/scene';

const leftEnd = 1 + hudWidth('ЭНЕРГИЯ ') + 10 * 0.6;

it('hudWidth считает шаг 0.6 на символ', () => {
  expect(hudWidth('ab')).toBeCloseTo(1.2);
});

it('строка 0 слева вычищается под шкалу энергии', () => {
  expect(hudCell(0, 0, 'lab-1', 1)).toBe(true);
  expect(hudCell(Math.ceil(leftEnd), 0, 'lab-1', 1)).toBe(true);
  expect(hudCell(Math.ceil(leftEnd) + 1, 0, 'lab-1', 1)).toBe(false);
  expect(hudCell(20, 0, 'lab-1', 1)).toBe(false);
});

it('строка 0 справа вычищается под id комнаты', () => {
  const start = Math.floor(ROOM_W - 1 - hudWidth('lab-1')) - 1;
  expect(hudCell(start, 0, 'lab-1', 1)).toBe(true);
  expect(hudCell(start - 1, 0, 'lab-1', 1)).toBe(false);
});

it('строка атрибуции вычищает пол только первые 8 секунд', () => {
  expect(hudCell(ROOM_W - 2, ROOM_H - 1, 'lab-1', 1)).toBe(true);
  expect(hudCell(ROOM_W - 2, ROOM_H - 1, 'lab-1', 9)).toBe(false);
  expect(hudCell(0, ROOM_H - 1, 'lab-1', 1)).toBe(false);
});
