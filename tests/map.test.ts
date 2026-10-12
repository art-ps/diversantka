import { expect, it } from 'vitest';
import { DT } from '../src/config';
import { createGame, stepGame } from '../src/game';
import { IDLE } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { drawMap, MAP_AREA, MAP_HINT, MAP_LEGEND, MAP_TITLE } from '../src/render/map';
import { drawGame } from '../src/render/scene';
import { layoutMap, mapIcons } from '../src/world/map';
import type { Room } from '../src/world/room';
import { loadRoomsFs, roomOf } from './helpers';

const R = (id: string, exits: Room['exits']): Room => ({ ...roomOf({}, exits), id });

it('раскладка карты по выходам: соседи — в соседних клетках, пролог без выходов не попадает', () => {
  const { pos, conflicts } = layoutMap(loadRoomsFs(), 'lab-1');
  expect(conflicts).toEqual([]);
  expect(Object.fromEntries([...pos].map(([id, c]) => [id, [c.x, c.y]]))).toEqual({
    'roof-1': [1, -1], 'roof-2': [2, -1], 'roof-3': [3, -1],
    'slope-1': [-1, 0], 'lab-1': [0, 0], 'lab-2': [1, 0], 'lab-3': [2, 0], 'hall-1': [3, 0],
    'arch-1': [0, 1], office: [1, 1], 'corr-1': [2, 1], 'evm-1': [3, 1],
    'store-1': [0, 2], 'store-2': [1, 2], 'store-3': [2, 2], 'evm-2': [3, 2],
    'secret-1': [1, 3], 'power-1': [2, 3], 'shaft-top': [3, 3], boiler: [4, 3],
    'cave-3': [0, 4], 'cave-2': [1, 4], 'cave-1': [2, 4], 'shaft-1': [3, 4],
    'shaft-2': [3, 5], 'garage-1': [2, 6], 'shaft-bot': [3, 6],
  });
});

it('раскладка: занятая клетка и несходящийся выход — в conflicts, комната на чужое место не встаёт', () => {
  // a→b вправо, a→c вниз, b→e вниз, c→d вправо: d и e претендуют на одну клетку
  const clash = new Map([
    ['a', R('a', { right: 'b', down: 'c' })], ['b', R('b', { left: 'a', down: 'e' })],
    ['c', R('c', { up: 'a', right: 'd' })], ['d', R('d', { left: 'c' })], ['e', R('e', { up: 'b' })],
  ]);
  const one = layoutMap(clash, 'a');
  expect(one.pos.has('d')).toBe(false);
  expect(one.conflicts).toEqual(['d: клетка карты занята комнатой e']);
  // a→b→c вправо, но c ещё и под a
  const bent = new Map([
    ['a', R('a', { right: 'b', down: 'c' })], ['b', R('b', { left: 'a', right: 'c' })], ['c', R('c', { up: 'a', left: 'b' })],
  ]);
  expect(layoutMap(bent, 'a').conflicts).toEqual(['b: выход right → c не сходится с картой', 'c: выход left → b не сходится с картой']);
});

it('значки: терминал, главная ЭВМ, щиток, гараж, неподобранные ленты; источник — без значка', () => {
  const rooms = loadRoomsFs();
  const none = new Set<string>();
  expect(mapIcons(rooms.get('lab-2')!, none)).toEqual(['terminal']);
  expect(mapIcons(rooms.get('evm-1')!, none)).toEqual(['main']);
  expect(mapIcons(rooms.get('arch-1')!, none)).toEqual(['tape']);
  expect(mapIcons(rooms.get('arch-1')!, new Set(['arch-1#t0']))).toEqual([]);
  expect(mapIcons(rooms.get('power-1')!, none)).toEqual(['switch']);
  expect(mapIcons(rooms.get('garage-1')!, none)).toEqual(['bike', 'tape']);
  expect(mapIcons(rooms.get('secret-1')!, none)).toEqual([]);
});

const collect = (g: ReturnType<typeof createGame>, time: number) => {
  const glyphs: { x: number; y: number; ch: string }[] = [], texts: string[] = [];
  drawMap({ push: (x, y, ch) => { glyphs.push({ x, y, ch }); }, text: (_x, _y, s) => { texts.push(s); } }, g, time);
  return { glyphs, texts };
};

it('карта: только открытые комнаты, текущая мигает, всё внутри области и из атласа', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  g.seen = new Set(['lab-1', 'lab-2', 'lab-3']);
  const a = collect(g, 0), b = collect(g, 0.4);
  expect(a.texts).toEqual([MAP_TITLE, MAP_LEGEND, MAP_HINT]);
  // три блока по 8 полклеток, связи lab-1 — lab-2 — lab-3
  expect(a.glyphs).toHaveLength(3 * 8 + 2);
  expect(a.glyphs.filter(p => p.ch === '-')).toHaveLength(2);
  expect(a.glyphs.filter(p => p.ch === 'Т')).toHaveLength(1);
  expect(a.glyphs.filter(p => p.ch === '▓').length).toBeGreaterThan(b.glyphs.filter(p => p.ch === '▓').length);
  g.seen = new Set(loadRoomsFs().keys());
  const all = collect(g, 0);
  for (const p of all.glyphs) {
    expect(CHARSET).toContain(p.ch);
    expect(p.x + 0.5).toBeGreaterThanOrEqual(MAP_AREA.x0);
    expect(p.x + 0.5).toBeLessThan(MAP_AREA.x1 + 1);
    expect(p.y + 0.5).toBeGreaterThanOrEqual(MAP_AREA.y0);
    expect(p.y + 0.5).toBeLessThan(MAP_AREA.y1 + 1);
  }
  for (const s of all.texts) for (const ch of s) expect(CHARSET).toContain(ch);
});

it('в паузе кадр — карта и HUD, комнату не рисуем', () => {
  const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 4, bottom: 22 });
  stepGame(g, { ...IDLE, pausePressed: true }, DT);
  const chars: string[] = [], texts: string[] = [];
  drawGame({ push: (_x: number, _y: number, ch: string) => { chars.push(ch); }, text: (_x: number, _y: number, s: string) => { texts.push(s); } } as never, g, 1);
  expect(texts).toContain(MAP_TITLE);
  expect(chars.some(ch => '#%&8'.includes(ch))).toBe(false);
});
