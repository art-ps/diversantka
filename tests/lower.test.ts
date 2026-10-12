import { expect, it } from 'vitest';
import { DT, FLAMER, NINA } from '../src/config';
import { createGame, enterRoom, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { flamerPhase } from '../src/sim/flamer';
import type { Room } from '../src/world/room';
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
