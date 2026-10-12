import { expect, it } from 'vitest';
import { DT, FLAMER, MISSION, NINA } from '../src/config';
import { createGame, enterRoom, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { flamerPhase } from '../src/sim/flamer';
import { tileAt, type Room } from '../src/world/room';
import { loadRoomsFs } from './helpers';
import { reachableNodes, targetDamage, unreachable } from './reach';

// Низ — шахта, пещеры, река, лес, гараж — настоящей физикой. Враги убраны со всей карты, огнемёты — если тест не про них.
const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const run = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) stepGame(g, I(p), DT);
};
const cx = (g: Game) => g.nina.body.x + g.nina.body.w / 2;
const bottomOf = (g: Game) => g.nina.body.y + g.nina.body.h;
const quiet = (flamers: boolean) => {
  const rooms = loadRoomsFs();
  for (const [id, r] of rooms) {
    const enemies = (r.meta.enemies ?? '').split(';').filter(e => flamers && e.trim().startsWith('flamer')).join(';');
    rooms.set(id, { ...r, meta: { ...r.meta, enemies } });
  }
  return rooms;
};
const at = (room: string, x: number, bottom: number, flamers = false) => {
  const g = createGame(quiet(flamers), { room, x: x - NINA.w / 2, bottom });
  run(g, {}, 5);
  return g;
};
// Дойти до центра x (у цели — медленно) и встать.
const walkTo = (g: Game, x: number) => {
  for (let i = 0; i < 900; i++) {
    const d = x - cx(g);
    if (Math.abs(d) < 0.25 && g.nina.state === 'ground' && Math.abs(g.nina.body.vx) < 0.5) break;
    stepGame(g, I({ moveX: Math.abs(d) < 1 ? Math.sign(d) * 0.3 : Math.sign(d) }), DT);
  }
  run(g, {}, 20);
};
// Прыжок с разгоном в сторону dir: держать прыжок и направление n кадров, потом встать.
const jump = (g: Game, dir: -1 | 0 | 1, n = 40) => {
  stepGame(g, I({ moveX: dir, jump: true, jumpPressed: true }), DT);
  run(g, { moveX: dir, jump: true }, n);
  run(g, {}, 20);
};
// Прыжок с места на соседний камень: mx — доля скорости бега.
const hop = (g: Game, dir: -1 | 1, mx = 1) => {
  stepGame(g, I({ moveX: dir * mx, jump: true, jumpPressed: true }), DT);
  run(g, { moveX: dir * mx, jump: true }, 60, () => g.nina.state === 'ground');
  run(g, {}, 20);
};
const climbUntil = (g: Game, dir: 'up' | 'down', until: () => boolean) => {
  run(g, { [dir]: true }, 1500, until);
  run(g, {}, 20);
};
// Держать направление, пока не выполнится until и героиня не встанет на землю (переход экрана закончен).
const goUntil = (g: Game, dir: -1 | 1, until: () => boolean) => {
  run(g, { moveX: dir }, 900, () => until() && g.nina.state === 'ground' && !g.transition);
  run(g, {}, 20);
};
const onFloor = (g: Game, b: number) => () => Math.abs(bottomOf(g) - b) < 0.01;
const inRoom = (g: Game, id: string) => () => g.roomId === id;
const patch = (room: Room, cells: [number, number, string][], meta: Record<string, string> = room.meta): Room => {
  const tiles = room.tiles.map(row => [...row]);
  for (const [c, r, ch] of cells) tiles[r][c] = ch;
  return { ...room, meta, tiles: tiles.map(row => row.join('')) };
};
const LANDINGS = [{ room: 'roof-1', x: 8, bottom: 22 }, { room: 'slope-1', x: 2, bottom: 14 }];

// ---- пещеры ----

it('из shaft-1 через cave-1 и cave-2 в cave-3: ящик, бугор, сталагмиты — прыжками, без урона', () => {
  const g = at('shaft-1', 21, 22);
  jump(g, -1, 30); // ящик x16..18
  expect(cx(g)).toBeLessThan(16);
  goUntil(g, -1, inRoom(g, 'cave-1'));
  walkTo(g, 13);
  jump(g, -1, 30); // бугор x8..10
  goUntil(g, -1, inRoom(g, 'cave-2'));
  walkTo(g, 32);
  jump(g, -1, 30); // сталагмиты x27..29
  walkTo(g, 13.5);
  jump(g, -1, 30); // сталагмиты x9..11
  goUntil(g, -1, inRoom(g, 'cave-3'));
  expect(g.roomId).toBe('cave-3');
  expect(bottomOf(g)).toBeCloseTo(22);
  expect(g.nina.energy).toBe(NINA.energyMax);
});

it('cave-2: сталагмиты бьют', () => {
  const g = at('cave-2', 33, 22);
  run(g, { moveX: -1 }, 40);
  expect(g.nina.energy).toBeLessThan(NINA.energyMax);
});

it('cave-3: лента на верхней ступени — прыжками и справа, и слева', () => {
  for (const [x, dir] of [[25, -1], [12, 1]] as const) {
    const g = at('cave-3', x, 22);
    jump(g, dir, 20);
    expect(bottomOf(g), `${x}`).toBeCloseTo(19);
    jump(g, dir, 20);
    expect(bottomOf(g), `${x}`).toBeCloseTo(16);
    walkTo(g, 19);
    expect(g.mission.tapes.has('cave-3#t0'), `${x}`).toBe(true);
  }
});

it('без нижних ступеней лента cave-3 недостижима', () => {
  const rooms = loadRoomsFs();
  const cells: [number, number, string][] = [];
  for (let r = 19; r <= 21; r++) for (const c of [14, 15, 16, 21, 22]) cells.push([c, r, '.']);
  rooms.set('cave-3', patch(rooms.get('cave-3')!, cells));
  expect(unreachable(rooms, LANDINGS)).toEqual(['лента cave-3#t0']);
});

// ---- река ----

it('cave-3 ↔ river-3 и cave-2 ↔ river-2 по лестницам, без урона', () => {
  for (const [top, x, low, b] of [['cave-3', 34.5, 'river-3', 14], ['cave-2', 19.5, 'river-2', 17]] as const) {
    const g = at(top, x, 22);
    climbUntil(g, 'down', () => g.roomId === low && g.nina.state === 'ground');
    expect(g.roomId, top).toBe(low);
    expect(bottomOf(g), top).toBeCloseTo(b);
    climbUntil(g, 'up', () => g.roomId === top && g.nina.state === 'ground');
    expect(g.roomId, low).toBe(top);
    expect(bottomOf(g), low).toBeCloseTo(22);
    expect(g.nina.energy, top).toBe(NINA.energyMax);
  }
});

it('river-3: брод на остров неизбежен и стоит 20–30 энергии; лента на острове', () => {
  const g = at('river-3', 31.5, 14);
  run(g, { moveX: -1 }, 120, () => bottomOf(g) > 21.9 && g.nina.state === 'ground');
  walkTo(g, 10.5);
  climbUntil(g, 'up', () => g.nina.state === 'ground' && bottomOf(g) < 14.1);
  expect(bottomOf(g)).toBeCloseTo(14);
  const lost = NINA.energyMax - g.nina.energy;
  expect(lost).toBeGreaterThan(20);
  expect(lost).toBeLessThan(30);
  walkTo(g, 6);
  expect(g.mission.tapes.has('river-3#t0')).toBe(true);
});

it('river-3: с берега протоку не перепрыгнуть; из воды — по лестницам на оба берега', () => {
  const j = at('river-3', 31.5, 14);
  jump(j, -1, 40);
  expect(bottomOf(j)).toBeCloseTo(22); // в воде
  for (const [L, side] of [[31.5, 'берег'], [10.5, 'остров']] as const) {
    const g = at('river-3', 20, 22);
    walkTo(g, L);
    climbUntil(g, 'up', () => g.nina.state === 'ground' && bottomOf(g) < 14.1);
    expect(bottomOf(g), side).toBeCloseTo(14);
  }
});

it('модель: брод стоит не меньше настоящего; без лестницы на остров лента недостижима', () => {
  const rooms = loadRoomsFs();
  const bank = [{ room: 'river-3', x: 33, bottom: 14 }];
  const d = targetDamage(rooms, bank).get('лента river-3#t0')!;
  expect(d).toBeGreaterThan(20);
  expect(d).toBeLessThan(NINA.energyMax / 2);
  const cells: [number, number, string][] = [[10, 14, '.']];
  for (let r = 15; r <= 21; r++) cells.push([10, r, '~']);
  rooms.set('river-3', patch(rooms.get('river-3')!, cells));
  expect(unreachable(rooms, LANDINGS)).toEqual(['лента river-3#t0']);
});

it('по камням: shaft-2 → river-1 → river-2 → river-3 сухой ногой', () => {
  const g = at('shaft-2', 20, 22);
  goUntil(g, -1, inRoom(g, 'river-1'));
  walkTo(g, 34);
  hop(g, -1, 0.6); // на уступ
  expect(bottomOf(g)).toBeCloseTo(20);
  for (const c of [31, 25, 19, 13, 7]) {
    walkTo(g, c);
    hop(g, -1, 0.8);
    expect(bottomOf(g), `river-1 с ${c}`).toBeCloseTo(19);
  }
  goUntil(g, -1, inRoom(g, 'river-2'));
  for (const [c, mx, b] of [[37, 1, 19], [31, 1, 19], [25, 1, 17], [19, 0.7, 19], [13, 1, 17], [7, 1, 14]] as const) {
    walkTo(g, c);
    hop(g, -1, mx);
    expect(bottomOf(g), `river-2 с ${c}`).toBeCloseTo(b);
  }
  goUntil(g, -1, inRoom(g, 'river-3'));
  expect(bottomOf(g)).toBeCloseTo(14);
  expect(g.nina.energy).toBe(NINA.energyMax);
});

// ---- лес ----

it('лес: склон → forest-1 → forest-2 → forest-3 → cave-in → cave-3 без урона, колючки — прыжком', () => {
  const g = at('slope-1', 34, 22);
  goUntil(g, 1, inRoom(g, 'forest-1'));
  expect(bottomOf(g)).toBeCloseTo(5);
  goUntil(g, -1, onFloor(g, 22));
  goUntil(g, 1, inRoom(g, 'forest-2'));
  goUntil(g, -1, onFloor(g, 16));
  goUntil(g, 1, onFloor(g, 22));
  walkTo(g, 11);
  jump(g, -1, 30); // колючки x8..9
  goUntil(g, -1, inRoom(g, 'forest-3'));
  goUntil(g, 1, onFloor(g, 16));
  goUntil(g, -1, onFloor(g, 22));
  walkTo(g, 28);
  jump(g, 1, 30); // колючки x30..31
  goUntil(g, 1, inRoom(g, 'cave-in'));
  goUntil(g, -1, onFloor(g, 22));
  goUntil(g, 1, inRoom(g, 'cave-3'));
  expect(g.roomId).toBe('cave-3');
  expect(g.nina.energy).toBe(NINA.energyMax);
});

it('со склона в корпус — только через лес, низ и лифт: без лифта корпус недостижим', () => {
  const rooms = loadRoomsFs();
  const top = rooms.get('shaft-top')!;
  const { lift: _, ...meta } = top.meta;
  rooms.set('shaft-top', { ...top, meta });
  const reached = new Set([...reachableNodes(rooms, [LANDINGS[1]])].map(k => k.split('|')[1]));
  expect(reached.has('cave-3') && reached.has('river-3')).toBe(true);
  const corpus = [
    'arch-1', 'boiler', 'corr-1', 'evm-1', 'evm-2', 'hall-1', 'lab-1', 'lab-2', 'lab-3', 'office', 'power-1',
    'roof-1', 'roof-2', 'roof-3', 'secret-1', 'shaft-top', 'store-1', 'store-2', 'store-3',
  ];
  expect(corpus.filter(id => reached.has(id))).toEqual([]);
});

it('forest-2: колючки бьют', () => {
  const g = at('forest-2', 12, 22);
  run(g, { moveX: -1 }, 30);
  expect(g.nina.energy).toBeLessThan(NINA.energyMax);
});

// ---- двор, гараж, тоннель ----

it('с острова в провал: грот, жёлоб во двор, уступами вниз — без урона; к гаражу', () => {
  const g = at('river-3', 6, 14);
  goUntil(g, -1, onFloor(g, 22));
  expect(g.roomId).toBe('river-3'); // грот под островом
  goUntil(g, 1, inRoom(g, 'yard'));
  expect(bottomOf(g)).toBeCloseTo(5);
  goUntil(g, 1, onFloor(g, 22));
  goUntil(g, 1, inRoom(g, 'garage-1'));
  expect(g.roomId).toBe('garage-1');
  expect(g.nina.energy).toBe(NINA.energyMax);
});

it('из грота и со двора наверх не подняться — путь назад только через гараж и лифт', () => {
  const rooms = loadRoomsFs();
  const top = rooms.get('shaft-top')!;
  const { lift: _, ...meta } = top.meta;
  rooms.set('shaft-top', { ...top, meta });
  for (const s of [{ room: 'river-3', x: 3, bottom: 22 }, { room: 'yard', x: 30, bottom: 22 }]) {
    const d = targetDamage(rooms, [s]);
    expect([...d.keys()], s.room).toEqual(['гараж']);
  }
});

it('tunnel-1: огнемёт на трубе бьёт; в паузу проходится без урона', () => {
  const burn = at('tunnel-1', 12, 22, true);
  burn.flamers[0].t = FLAMER.off + 0.01; // сразу огонь
  run(burn, { moveX: 1 }, 30);
  expect(burn.nina.energy).toBeLessThan(NINA.energyMax);
  const g = at('tunnel-1', 12, 22, true);
  const f = g.flamers[0];
  run(g, {}, 400, () => flamerPhase(f) === 'off' && f.t < 0.05);
  goUntil(g, 1, inRoom(g, 'shaft-bot'));
  expect(g.nina.energy).toBe(NINA.energyMax);
  const back = at('shaft-bot', 3, 22, true);
  goUntil(back, -1, inRoom(back, 'tunnel-1'));
  walkTo(back, 28);
  const b = back.flamers[0];
  run(back, {}, 400, () => flamerPhase(b) === 'off' && b.t < 0.05);
  goUntil(back, -1, inRoom(back, 'garage-1'));
  expect(back.nina.energy).toBe(NINA.energyMax);
});

it('garage-1: перед мотоциклом ровный пол; ключ на полу, дальше useRange от мотоцикла — подобрать', () => {
  const g = at('garage-1', 3, 22);
  const room = g.rooms.get('garage-1')!;
  for (const r of [20, 21]) for (let c = 0; c < 40; c++) expect(tileAt(room, c, r), `${c},${r}`).toBe('.');
  const wrench = g.items.find(i => i.kind === 'wrench')!;
  expect(wrench).toMatchObject({ x: 6.5, bottom: 22 });
  expect(Math.abs(wrench.x - g.bike!.x)).toBeGreaterThan(MISSION.useRange);
  walkTo(g, 6.5);
  expect(bottomOf(g)).toBeCloseTo(22);
  stepGame(g, I({ throwPressed: true }), DT);
  expect(g.nina.held).toBe('wrench');
});

it('двор: за забор под током не выйти — слева стена, и с пола, и с площадки над забором', () => {
  const fence = { x: 1, top: 17, bottom: 21 };
  const g = at('yard', 10, 22);
  expect(g.fence).toEqual(fence);
  run(g, { moveX: -1 }, 300);
  expect(g.roomId).toBe('yard');
  expect(g.nina.body.x).toBeGreaterThanOrEqual(fence.x - 1e-6); // не левее забора
  expect(g.nina.body.x).toBeLessThan(fence.x + 0.5); // дошла до него и упёрлась
  const top = at('yard', 2.5, 16); // площадка «=» над забором
  expect(bottomOf(top)).toBeCloseTo(16);
  run(top, { moveX: -1 }, 120);
  stepGame(top, I({ moveX: -1, jump: true, jumpPressed: true }), DT);
  run(top, { moveX: -1, jump: true }, 40);
  run(top, { moveX: -1 }, 120);
  expect(top.roomId).toBe('yard');
  expect(top.nina.body.x).toBeGreaterThanOrEqual(fence.x - 1e-6);
});

it('мотоцикл в гараже, забор во дворе: под током не едет, после щитка — выезд', () => {
  const g = at('garage-1', 20, 22);
  expect(g.fence).toBeNull();
  enterRoom(g, 'yard');
  expect(g.fence).toEqual({ x: 1, top: 17, bottom: 21 });
  enterRoom(g, 'garage-1');
  stepGame(g, I({ usePressed: true }), DT);
  expect(g.mission.result).toBeNull();
  g.mission.tapesIn = true;
  g.mission.fenceOff = true;
  run(g, {}, 5);
  stepGame(g, I({ usePressed: true }), DT);
  expect(g.mission.result).toBe('won');
});
