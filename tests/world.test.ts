import { expect, it } from 'vitest';
import { validateWorld } from '../src/world/room';
import { loadRoomsFs } from './helpers';

it('тестовые комнаты читаются и связаны взаимно', () => {
  const rooms = loadRoomsFs();
  expect([...rooms.keys()].sort()).toEqual(['cave-1', 'lab-1', 'lab-2']);
  expect(validateWorld(rooms)).toEqual([]);
});
