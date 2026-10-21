import { describe, expect, it } from 'vitest';
import { NINA } from '../src/config';
import { loadTemplates, type Template } from '../src/gen/templates';
import type { Spot } from '../src/sim/mission';
import { DIRS, OPPOSITE, type Dir, type Room } from '../src/world/room';
import { parseFence, parsePoints } from '../src/world/spawns';
import { routeDamage } from './reach';

const WALL = '#'.repeat(40);
const rows = (n: number, row: string) => Array<string>(n).fill(row);
const SHAFT = '#'.repeat(29) + '.H.' + '#'.repeat(8);
const ROOM = '#' + '.'.repeat(38) + '#';
const ROOM_WITH_LADDER = '#' + '.'.repeat(28) + '.H.' + '.'.repeat(7) + '#'; // лестница до пола: её низ на полу
// Соседи-заглушки по стандарту проёмов: комната слева от шаблона (выход right), справа (left), сверху (down), снизу (up).
const STUB: Record<Dir, string[]> = {
  left: [...rows(18, WALL), ...rows(4, '#' + '.'.repeat(39)), ...rows(3, WALL)],
  right: [...rows(18, WALL), ...rows(4, '.'.repeat(39) + '#'), ...rows(3, WALL)],
  up: [...rows(10, WALL), ...rows(12, ROOM), ...rows(3, SHAFT)], // лестница — только в шахте: её верх на полу, с пола на неё встать
  down: [...rows(3, SHAFT), ...rows(19, ROOM_WITH_LADDER), ...rows(3, WALL)],
};
// Где встать в заглушке (x — левый край тела).
const STUB_SPOT: Record<Dir, Spot> = {
  left: { room: 'stub-left', x: 19, bottom: 22 },
  right: { room: 'stub-right', x: 19, bottom: 22 },
  up: { room: 'stub-up', x: 10, bottom: 22 },
  down: { room: 'stub-down', x: 10, bottom: 22 },
};

// Шаблон T с заглушками на всех его выходах.
function stand(t: Template): Map<string, Room> {
  const rooms = new Map<string, Room>();
  const exits: Partial<Record<Dir, string>> = {};
  for (const d of t.fits) {
    exits[d] = `stub-${d}`;
    rooms.set(`stub-${d}`, { id: `stub-${d}`, exits: { [OPPOSITE[d]]: 'T' }, meta: {}, tiles: STUB[d] });
  }
  rooms.set('T', { id: 'T', exits, meta: {}, tiles: t.tiles });
  return rooms;
}

// Можно встать центром не дальше клетки от x на полу bottom в комнате room без урона.
const free = (dist: Map<string, number>, room: string, x: number, bottom: number) =>
  [...dist].some(([k, v]) => {
    const [s, id, c, r] = k.split('|');
    return s === 'S' && id === room && Number(r) === bottom && Math.abs(Number(c) + 1 - x) <= 1 && v === 0;
  });

const points = (t: Template) => {
  const out = t.slots.flatMap(s => (s.kind === 'item' || s.kind === 'terminal' || s.kind === 'site' ? [{ what: `${s.kind} ${s.x},${s.bottom}`, x: s.x, bottom: s.bottom }] : []));
  if (t.tags.has('start')) {
    const [b] = parsePoints(t.meta.bike, t.id, 'мотоцикла');
    const [s] = parsePoints(t.meta.start, t.id, 'старта');
    out.push({ what: 'мотоцикл', x: b.x, bottom: b.bottom }, { what: 'старт', x: s.x + NINA.w / 2, bottom: s.bottom });
  }
  return out;
};

const ALL = loadTemplates();

describe('каждый шаблон и его зеркало: выходы и слоты связаны путём без урона в обе стороны', () => {
  for (const t of ALL) {
    it(t.id, () => {
      const rooms = stand(t);
      const pts = points(t);
      const missing: string[] = [];
      for (const d of t.fits) {
        const dist = routeDamage(rooms, [STUB_SPOT[d]]);
        for (const o of t.fits) if (o !== d && !free(dist, `stub-${o}`, STUB_SPOT[o].x + NINA.w / 2, 22)) missing.push(`${d} → ${o}`);
        for (const p of pts) if (!free(dist, 'T', p.x, p.bottom)) missing.push(`${d} → ${p.what}`);
      }
      for (const p of pts) {
        const dist = routeDamage(rooms, [{ room: 'T', x: p.x - NINA.w / 2, bottom: p.bottom }]);
        for (const o of t.fits) if (!free(dist, `stub-${o}`, STUB_SPOT[o].x + NINA.w / 2, 22)) missing.push(`${p.what} → ${o}`);
      }
      expect(missing).toEqual([]);
    });
  }
});

it('состав библиотеки: 26 файлов, 2 стартовых, на каждый набор выходов — шаблон ровно под него; зеркала — только без up/down', () => {
  const originals = ALL.filter(t => !t.id.endsWith('~m'));
  expect(originals).toHaveLength(26);
  for (const t of ALL.filter(x => x.id.endsWith('~m'))) expect(t.fits.has('up') || t.fits.has('down'), t.id).toBe(false);
  expect(originals.filter(t => t.tags.has('start')).map(t => t.id).sort()).toEqual(['dock', 'yard']);
  const plain = ALL.filter(t => !t.tags.has('start'));
  for (let mask = 1; mask < 16; mask++) {
    const set = DIRS.filter((_, i) => mask & (1 << i)).sort().join(' ');
    expect(plain.some(t => [...t.fits].sort().join(' ') === set), set).toBe(true);
  }
});

it('слоты библиотеки: четырёхсторонние — со всеми ролями, огнемёты, камеры, решётки, тупики', () => {
  const originals = ALL.filter(t => !t.id.endsWith('~m') && !t.tags.has('start'));
  const has = (t: Template, kind: string, n = 1) => t.slots.filter(s => s.kind === kind).length >= n;
  const four = originals.filter(t => t.fits.size === 4);
  expect(four.length).toBeGreaterThanOrEqual(3);
  for (const t of four) {
    expect(has(t, 'item') && has(t, 'site') && has(t, 'terminal') && has(t, 'enemy'), t.id).toBe(true);
    expect(t.min, t.id).toBe(3);
  }
  expect(originals.filter(t => has(t, 'flamer')).length).toBeGreaterThanOrEqual(4);
  expect(originals.filter(t => has(t, 'camera')).length).toBeGreaterThanOrEqual(4);
  expect(originals.filter(t => t.tiles.some(r => r.includes('A'))).length).toBeGreaterThanOrEqual(2);
  expect(originals.filter(t => t.tags.has('deadend') && t.fits.size === 1).length).toBeGreaterThanOrEqual(3);
  expect(originals.filter(t => has(t, 'site')).length).toBeGreaterThanOrEqual(8);
  expect(originals.filter(t => has(t, 'terminal')).length).toBeGreaterThanOrEqual(8);
  // На уровне 3 каждый набор выходов закрывается шаблоном с min 3 (с четырёхсторонним в запасе).
  for (const t of ALL.filter(x => x.tags.has('start'))) {
    expect(t.min, t.id).toBe(3);
    expect(parseFence(t.meta.fence, t.id)).not.toBeNull();
  }
});
