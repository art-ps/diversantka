import { expect, it } from 'vitest';
import { loadWorld, validateAmbient } from '../src/world';
import { AMBIENTS, parseAmbient } from '../src/world/spawns';
import type { Room } from '../src/world/room';
import { loadRoomsFs, roomOf } from './helpers';

it('ambient: одно слово из списка; пусто — нет фона; другое — ошибка с файлом', () => {
  expect(AMBIENTS).toEqual(['storm', 'hum', 'drips', 'river', 'wind']);
  expect(parseAmbient('drips', 'a')).toBe('drips');
  expect(parseAmbient(' wind ', 'a')).toBe('wind');
  expect(parseAmbient(undefined, 'a')).toBeNull();
  expect(() => parseAmbient('rain', 'a')).toThrow('a: неизвестный фон «rain»');
});

it('карта: у каждой комнаты свой фон, без него или с чужим словом — ошибка загрузки', () => {
  const rooms = loadRoomsFs();
  expect(validateAmbient(rooms)).toEqual([]);
  expect(() => loadWorld()).not.toThrow();
  const bad = new Map<string, Room>([
    ['x', { ...roomOf({}), id: 'x', meta: {} }],
    ['y', { ...roomOf({}), id: 'y', meta: { ambient: 'rain' } }],
  ]);
  expect(validateAmbient(bad)).toEqual(['x: нет фона «ambient:»', 'y: неизвестный фон «rain»']);
});

it('фон по месту: шторм под открытым небом пролога, капель в пещерах, течение у реки, ветер в лесу и во дворе, гул в НИИ', () => {
  const rooms = loadRoomsFs();
  const by = (a: string) => [...rooms.values()].filter(r => r.meta.ambient === a).map(r => r.id).sort();
  expect(by('storm')).toEqual(['roof-1', 'roof-2', 'roof-3', 'sea-1', 'sea-2', 'slope-1']);
  expect(by('drips')).toEqual(['cave-1', 'cave-2', 'cave-3', 'cave-in']);
  expect(by('river')).toEqual(['river-1', 'river-2', 'river-3']);
  expect(by('wind')).toEqual(['forest-1', 'forest-2', 'forest-3', 'yard']);
  expect(by('hum')).toHaveLength(rooms.size - 17);
  for (const r of rooms.values()) if (r.meta.sky === 'storm') expect(r.meta.ambient, r.id).toBe('storm');
});
