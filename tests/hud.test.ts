import { expect, it } from 'vitest';
import { ROOM_H } from '../src/config';
import { hudCell } from '../src/render/scene';

it('строка атрибуции вычищает пол только первые 8 секунд', () => {
  expect(hudCell(30, ROOM_H - 1, 'lab-1', 1)).toBe(true);
  expect(hudCell(30, ROOM_H - 1, 'lab-1', 9)).toBe(false);
});
