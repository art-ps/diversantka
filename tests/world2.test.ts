import { expect, it } from 'vitest';
import { DT, MISSION, NINA } from '../src/config';
import { createGame, stepGame, type Game } from '../src/game';
import { STR } from '../src/i18n';
import { IDLE, type Intent } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { drawMap, MAP_AREA, MAP_PX, MAP_PY } from '../src/render/map';
import { drawGame } from '../src/render/scene';
import { isSolid } from '../src/sim/physics';
import { BUNKER_START, loadWorld, validateCameras, validateGates, validateMission } from '../src/world';
import { layoutMap } from '../src/world/map';
import { tileAt, type Room } from '../src/world/room';
import { parseCameras, parseEnemies, parseItems, parsePoints, parseTerminals } from '../src/world/spawns';
import { loadRoomsFs, roomOf } from './helpers';
import { doorRoute, routeDamage } from './reach';

// Набор комнат бункера (миссия 2) по мере раскладки.
const ROOMS2 = [
  'barracks', 'engine-1', 'engine-2', 'gate', 'lab-a', 'lab-b', 'reactor', 'shaft-1', 'shaft-2', 'shaft-3', 'store', 'vault', 'vent',
];

const R = (id: string, rows: Record<number, string>, meta: Record<string, string>): Room => ({ ...roomOf(rows), id, meta });
const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const run = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) stepGame(g, I(p), DT);
};
const bottomOf = (g: Game) => g.nina.body.y + g.nina.body.h;
// Героиня центром в x на полу bottom комнаты room бункера; враги убраны — проверяем тайлы и переходы.
const at = (room: string, x: number, bottom: number) => {
  const g = createGame(loadRoomsFs('rooms2'), { room, x: x - NINA.w / 2, bottom });
  g.androids = [];
  g.dogs = [];
  g.guards = [];
  run(g, {}, 5);
  return g;
};
// По лестнице до комнаты to: держать dir, пока не встанет на пол в to.
const climbTo = (g: Game, dir: 'up' | 'down', to: string) => {
  run(g, { [dir]: true }, 1500, () => g.roomId === to && g.nina.state === 'ground');
  run(g, {}, 30);
  expect(g.roomId).toBe(to);
};
// Узлы «стоит» модели достижимости: комната, центр тела x = c + 1, низ r.
const standing = (d: Map<string, number>) =>
  [...d.keys()].filter(k => k.startsWith('S|')).map(k => k.split('|')).map(([, id, c, r]) => ({ id, x: Number(c) + 1, r: Number(r) }));
// Можно встать в комнате room центром не дальше tol от x на полу bottom, выйдя из from при открытых дверях open.
const standsAt = (open: number[], room: string, x: number, bottom: number, tol = 1, from = [BUNKER_START]) =>
  standing(routeDamage(loadRoomsFs('rooms2'), from, new Set(open))).some(s => s.id === room && s.r === bottom && Math.abs(s.x - x) <= tol);

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
  expect(parsePoints(gate.meta.bike, 'gate', 'мотоцикла')[0].x).toBeLessThan(BUNKER_START.x);
  expect(BUNKER_START.bottom).toBe(22);
  // старт стоит на полу: клетка под ногами непроходима, над ней — проходима
  expect(isSolid(tileAt(gate, BUNKER_START.x, BUNKER_START.bottom))).toBe(true);
  expect(isSolid(tileAt(gate, BUNKER_START.x, BUNKER_START.bottom - 1))).toBe(false);
});

it('lab-a: камера не погашена — стоящая на открытом полу под лучом поднимает тревогу за один период', () => {
  const period = parseCameras(loadRoomsFs('rooms2').get('lab-a')!.meta.cameras, 'lab-a')[0].period;
  for (const x of [17, 30]) {
    const g = at('lab-a', x, 22);
    expect(g.mission.camerasOff.has('lab-a')).toBe(false);
    run(g, {}, Math.round(period / DT), () => g.alarmT > 0);
    expect(g.alarmT, `x=${x}`).toBeGreaterThan(0);
  }
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
    'a: терминал гасит огнемёты и камеры несуществующей комнаты zz',
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

// ---- раскладка набора: общие правила (работают на любом числе комнат) ----

it('мотоцикл, точка закладки, терминалы и предметы стоят на полу, а не в стене', () => {
  for (const r of loadRoomsFs('rooms2').values()) {
    const pts = [
      ...parsePoints(r.meta.bike, r.id, 'мотоцикла'), ...parsePoints(r.meta.bomb, r.id, 'точки закладки'),
      ...parseTerminals(r.meta.terminals, r.id), ...parseItems(r.meta.items, r.id),
    ];
    for (const p of pts) {
      expect('#=H', `${r.id} ${p.x},${p.bottom}`).toContain(tileAt(r, Math.floor(p.x), p.bottom));
      expect(tileAt(r, Math.floor(p.x), p.bottom - 1), `${r.id} ${p.x},${p.bottom}`).not.toBe('#');
    }
  }
});

// Враг не стоит на лестнице и в проёме выхода: участок патруля плюс клетка — без лестниц и не у края комнаты.
it('патрули врагов не перекрывают лестницы и выходы', () => {
  for (const r of loadRoomsFs('rooms2').values()) {
    for (const e of parseEnemies(r.meta.enemies, r.id)) {
      if (e.kind === 'flamer') continue;
      const [a, b] = e.patrol;
      for (let c = Math.floor(a - 1); c <= Math.ceil(b + 1); c++) {
        for (let row = e.bottom - 4; row <= e.bottom; row++) expect(tileAt(r, c, row), `${r.id} ${e.kind} ${a}..${b}: лестница ${c},${row}`).not.toBe('H');
      }
      expect(a - 1, `${r.id} ${e.kind}: у левого края`).toBeGreaterThan(1);
      expect(b + 1, `${r.id} ${e.kind}: у правого края`).toBeLessThan(39);
    }
  }
});

it('у терминалов и мотоцикла нет предметов на том же полу ближе useRange', () => {
  for (const r of loadRoomsFs('rooms2').values()) {
    for (const o of [...parseTerminals(r.meta.terminals, r.id), ...parsePoints(r.meta.bike, r.id, 'мотоцикла')]) {
      for (const i of parseItems(r.meta.items, r.id).filter(i => i.bottom === o.bottom)) expect(Math.abs(i.x - o.x), `${r.id} ${i.kind}@${i.x}`).toBeGreaterThan(MISSION.useRange);
    }
  }
});

it('каждая комната набора достижима со старта (все двери открыты) и из каждой есть путь к мотоциклу', () => {
  const rooms = loadRoomsFs('rooms2');
  const all = standing(routeDamage(rooms, [BUNKER_START], new Set([1, 2, 3]))).filter(s => s.x >= 1 && s.x <= 39);
  expect([...new Set(all.map(s => s.id))].sort()).toEqual(ROOMS2);
  for (const id of ROOMS2) {
    const s = all.find(n => n.id === id)!;
    const back = standing(routeDamage(rooms, [{ room: id, x: s.x - NINA.w / 2, bottom: s.r }], new Set([1, 2, 3])));
    expect(back.some(n => n.id === 'gate' && n.r === 22 && Math.abs(n.x - 5) <= MISSION.useRange), id).toBe(true);
  }
}, 20_000);

it('шахта: въезд ↔ shaft-1 ↔ shaft-2 ↔ shaft-3 по лестницам вниз и вверх без урона', () => {
  for (const [top, x, bottom, low] of [['gate', 30.5, 22, 'shaft-1'], ['shaft-1', 8.5, 12, 'shaft-2'], ['shaft-2', 30.5, 22, 'shaft-3']] as const) {
    const g = at(top, x, bottom);
    climbTo(g, 'down', low);
    expect(bottomOf(g), top).toBeCloseTo(low === 'shaft-1' ? 12 : 22);
    climbTo(g, 'up', top);
    expect(bottomOf(g), low).toBeCloseTo(bottom);
    expect(g.nina.energy, top).toBe(NINA.energyMax);
  }
});

it('ярус 1: из шахты в казармы, по лестнице на галерею и в склад; стеллаж (место ключа 1) и терминал 1 — без дверей', () => {
  const g = at('shaft-2', 36, 22);
  run(g, { moveX: 1 }, 300, () => g.roomId === 'barracks');
  expect(g.roomId).toBe('barracks');
  const gallery = at('barracks', 36, 14);
  run(gallery, { moveX: 1 }, 300, () => gallery.roomId === 'store');
  run(gallery, {}, 30);
  expect(gallery.roomId).toBe('store');
  expect(bottomOf(gallery)).toBeCloseTo(14);
  expect(standsAt([], 'store', 34, 19)).toBe(true); // стеллаж, где лежит ключ 1
  expect(standsAt([], 'store', 16, 22, MISSION.useRange)).toBe(true); // терминал 1
});

it('ярус 2: терминал 1 гасит камеры обеих лабораторий до сейфа; бомба и ключ 2 — только за дверью 1', () => {
  const rooms = loadRoomsFs('rooms2');
  const t1 = parseTerminals(rooms.get('store')!.meta.terminals, 'store')[0];
  expect(t1.controls).toEqual(['lab-a', 'lab-b']);
  for (const id of t1.controls) expect(parseCameras(rooms.get(id)!.meta.cameras, id).length, id).toBeGreaterThan(0);
  expect(standsAt([], 'vault', 20, 20)).toBe(false);
  expect(standsAt([], 'vault', 12, 22)).toBe(false);
  expect(standsAt([1], 'vault', 20, 20)).toBe(true);
  expect(standsAt([1], 'vault', 12, 22)).toBe(true);
});

it('ярус 2: дверь сейфа без ключа не пускает — героиня упирается в неё из lab-b', () => {
  const g = at('lab-b', 36, 22);
  run(g, { moveX: 1 }, 240);
  expect(g.roomId).toBe('vault');
  expect(g.nina.body.x + g.nina.body.w).toBeLessThanOrEqual(2 + 1e-6);
  stepGame(g, I({ usePressed: true }), DT);
  expect(g.mission.doorsOpen.size).toBe(0);
});

it('ярус 3: маршрут «ключ → дверь» сходится; ключ 3 в реакторной — без двери 3; точка закладки — только за дверью 2', () => {
  const rooms = loadRoomsFs('rooms2');
  expect(doorRoute(rooms, [BUNKER_START])).toEqual([]);
  expect(standsAt([1, 2], 'reactor', 6, 14)).toBe(true);
  expect(standsAt([1], 'reactor', 20, 22, MISSION.useRange)).toBe(false);
  expect(standsAt([1, 2], 'reactor', 20, 22, MISSION.useRange)).toBe(true);
  const t2 = parseTerminals(rooms.get('engine-1')!.meta.terminals, 'engine-1')[0];
  expect(t2.controls).toEqual(['engine-2']);
  // камеры — только в двух лабораториях и в машинном зале; каждую гасит свой терминал
  expect([...rooms.values()].filter(r => r.meta.cameras).map(r => r.id).sort()).toEqual(['engine-2', 'lab-a', 'lab-b']);
});

it('отход: от точки закладки через дверь 3 и вентиляцию к мотоциклу — урон от падений и воды меньше 10', () => {
  const rooms = loadRoomsFs('rooms2');
  const d = routeDamage(rooms, [{ room: 'reactor', x: 20 - NINA.w / 2, bottom: 22 }], new Set([1, 2, 3]));
  const bike = [...d].filter(([k]) => k.startsWith('S|gate|') && k.endsWith('|22')).map(([k, v]) => ({ x: Number(k.split('|')[2]) + 1, v }));
  const best = Math.min(...bike.filter(b => Math.abs(b.x - 5) <= MISSION.useRange).map(b => b.v));
  expect(best).toBeLessThan(10);
});

it('реакторная: с галереи с ключом 3 — вниз к двери 3 без урона (8 клеток — безопасная высота)', () => {
  const g = at('reactor', 6, 14);
  run(g, { moveX: -1 }, 120, () => g.nina.state === 'ground' && bottomOf(g) > 21);
  run(g, {}, 10);
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.energy).toBe(NINA.energyMax);
});

it('вентиляция: по лестнице из vent в shaft-3 и обратно без урона', () => {
  const g = at('vent', 4.5, 22);
  climbTo(g, 'up', 'shaft-3');
  expect(bottomOf(g)).toBeCloseTo(22);
  climbTo(g, 'down', 'vent');
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.energy).toBe(NINA.energyMax);
});

// ---- карта на паузе и отрисовка ----

it('карта паузы: бункер раскладывается от въезда без конфликтов и влезает в область карты', () => {
  const { pos, conflicts } = layoutMap(loadRoomsFs('rooms2'), 'gate');
  expect(conflicts).toEqual([]);
  expect(Object.fromEntries([...pos].map(([id, c]) => [id, [c.x, c.y]]))).toEqual({
    gate: [0, 0], 'shaft-1': [0, 1],
    'shaft-2': [0, 2], barracks: [1, 2], store: [2, 2],
    'shaft-3': [0, 3], 'lab-a': [1, 3], 'lab-b': [2, 3], vault: [3, 3],
    vent: [0, 4], reactor: [1, 4], 'engine-2': [2, 4], 'engine-1': [3, 4],
  });
  const xs = [...pos.values()].map(p => p.x), ys = [...pos.values()].map(p => p.y);
  expect((Math.max(...xs) - Math.min(...xs)) * MAP_PX + 2).toBeLessThanOrEqual(MAP_AREA.x1 - MAP_AREA.x0 + 1);
  expect((Math.max(...ys) - Math.min(...ys)) * MAP_PY + 1).toBeLessThanOrEqual(MAP_AREA.y1 - MAP_AREA.y0 + 1);
});

it('карта паузы рисуется на бункере: все комнаты, значки терминалов и мотоцикла, символы из атласа и внутри области', () => {
  const g = createGame(loadRoomsFs('rooms2'), BUNKER_START);
  g.seen = new Set(ROOMS2);
  const glyphs: { x: number; y: number; ch: string }[] = [];
  drawMap({ push: (x, y, ch) => { glyphs.push({ x, y, ch }); }, text: () => {} }, g, 0);
  expect(glyphs.filter(p => p.ch === STR.ru.mapIcons.terminal)).toHaveLength(2); // терминалы склада и машинного зала
  expect(glyphs.filter(p => p.ch === STR.ru.mapIcons.bike)).toHaveLength(1); // мотоцикл на въезде
  expect(glyphs.length).toBe(ROOMS2.length * 8 + 13); // блоки комнат по 8 полклеток и 13 связей
  for (const p of glyphs) {
    expect(CHARSET).toContain(p.ch);
    expect(p.x + 0.5).toBeGreaterThanOrEqual(MAP_AREA.x0);
    expect(p.x + 0.5).toBeLessThan(MAP_AREA.x1 + 1);
    expect(p.y + 0.5).toBeGreaterThanOrEqual(MAP_AREA.y0);
    expect(p.y + 0.5).toBeLessThan(MAP_AREA.y1 + 1);
  }
});

it('каждая комната бункера рисуется без исключений — и в игре, и на паузе', () => {
  const rooms = loadRoomsFs('rooms2');
  for (const id of ROOMS2) {
    const g = createGame(rooms, { room: id, x: 20, bottom: 22 });
    const batch = { push: () => {}, text: () => {} } as never;
    expect(() => drawGame(batch, g, 1), id).not.toThrow();
    stepGame(g, I({ pausePressed: true }), DT);
    expect(g.paused, id).toBe(true);
    expect(() => drawGame(batch, g, 1), id).not.toThrow();
  }
});
