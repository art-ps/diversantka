import { expect, it } from 'vitest';
import { BOMB, DT, MISSION, NINA } from '../src/config';
import { createGame, liveRoom, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { formatTime, missionResult } from '../src/sim/mission';
import { packRecord, replayStep, unpackRecord } from '../src/sim/record';
import { BUNKER_START } from '../src/world';
import { tileAt } from '../src/world/room';
import { loadRoomsFs } from './helpers';
import { routeDamage } from './reach';

// Эталонное прохождение бункера настоящей физикой: сценарий «знающего игрока» без гибелей — шахта, ярус 1 за ключом 1,
// ярус 2 за ключом 2, дверь 2, назад в сейф за бомбой, закладка, ключ 3, вентиляция, мотоцикл.
const log: string[] = [];
let atkToggle = false;
let minEnergy: number = NINA.energyMax;
// Для теста реплея: победная игра и положение героини после каждого записанного шага.
let won: Game | null = null;
const trace: string[] = [];
const pos = (g: Game) => `${g.roomId} ${g.nina.body.x} ${g.nina.body.y} ${g.mission.fuse}`;

const cx = (g: Game) => g.nina.body.x + g.nina.body.w / 2;
const bot = (g: Game) => g.nina.body.y + g.nina.body.h;
const clock = (g: Game) => MISSION.time - g.mission.timeLeft;
const where = (g: Game) =>
  `${g.roomId} x=${cx(g).toFixed(2)} b=${bot(g).toFixed(2)} st=${g.nina.state} e=${g.nina.energy.toFixed(0)} hits=${g.mission.hits} t=${formatTime(clock(g))} held=${g.nina.held} fuse=${g.mission.fuse?.toFixed(1)}`;

// Автозащита на полу. Охранник того же этажа: вплотную — удар ногой (целится — ногой сидя), целится издалека — присесть;
// пуля летит к героине — присесть. Андроид и собака вплотную — удар ногой; спиной — развернуться. Над люком «вниз»
// хватает лестницу — вместо приседа шаг с люка.
function guard(g: Game, p: Partial<Intent>): Partial<Intent> {
  if (g.screen || g.nina.dead || g.nina.state !== 'ground') return p;
  const overLadder = tileAt(liveRoom(g), Math.floor(cx(g)), Math.round(bot(g))) === 'H';
  const duck = (dir: number): Partial<Intent> => (overLadder ? { moveX: dir || 1 } : { down: true });
  const same = (b: { y: number; h: number }) => Math.abs(b.y + b.h - bot(g)) < 0.6;
  for (const gd of g.guards) {
    if (gd.state === 'dead' || !same(gd.body)) continue;
    const dx = gd.body.x + gd.body.w / 2 - cx(g);
    const aiming = (gd.state === 'aim' || gd.state === 'back') && gd.facing === -Math.sign(dx);
    if (Math.abs(dx) < 2.4) {
      if (Math.sign(dx) !== g.nina.facing) return { moveX: Math.sign(dx) };
      atkToggle = !atkToggle;
      return aiming && !overLadder ? { down: true, attackPressed: atkToggle } : { up: !overLadder, attackPressed: atkToggle };
    }
    if (aiming) return duck(Math.sign(dx));
  }
  for (const pr of g.projectiles) {
    if (pr.kind !== 'bullet' || !pr.alive) continue;
    const dx = cx(g) - pr.x;
    if (Math.abs(pr.y - (bot(g) - 2.6)) < 0.6 && Math.sign(dx) === Math.sign(pr.vx) && Math.abs(dx) < 10) return duck(-Math.sign(pr.vx));
  }
  const foes = [...g.androids.filter(a => a.state !== 'dead').map(a => a.body), ...g.dogs.filter(d => d.state !== 'dead').map(d => d.body)];
  for (const b of foes) {
    const dx = b.x + b.w / 2 - cx(g);
    if (!same(b) || Math.abs(dx) >= 2.6) continue;
    if (Math.sign(dx) !== g.nina.facing) return { moveX: Math.sign(dx) };
    atkToggle = !atkToggle;
    return { up: true, attackPressed: atkToggle };
  }
  return p;
}

function step(g: Game, p: Partial<Intent>) {
  const rec0 = g.rec.length;
  stepGame(g, { ...IDLE, ...guard(g, p) }, DT);
  if (g.rec.length > rec0) trace.push(pos(g));
  minEnergy = Math.min(minEnergy, g.nina.energy);
  expect(g.nina.dead, `гибель: ${where(g)}\n${log.join('\n')}`).toBe(false);
}
const run = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) step(g, p);
};
const idle = (g: Game, n = 10) => run(g, {}, n);
// Дойти до центра x в своей комнате (у цели — медленно, чтобы не проскочить).
function walkTo(g: Game, x: number, max = 1200) {
  const room = g.roomId;
  for (let i = 0; i < max; i++) {
    const d = x - cx(g);
    if (Math.abs(d) < 0.25 && g.nina.state === 'ground' && Math.abs(g.nina.body.vx) < 0.5) break;
    if (g.roomId !== room) break;
    step(g, { moveX: Math.abs(d) < 1 ? Math.sign(d) * 0.3 : Math.sign(d) });
  }
  idle(g, 20);
  expect(Math.abs(x - cx(g)), `${x}: ${where(g)}\n${log.join('\n')}`).toBeLessThan(0.5);
}
function exitTo(g: Game, dir: 1 | -1, room: string) {
  run(g, { moveX: dir }, 900, () => g.roomId === room);
  idle(g, 40);
  expect(g.roomId, `${where(g)}\n${log.join('\n')}`).toBe(room);
}
// Прыжок с разгоном: держать прыжок и направление n кадров.
function jumpRun(g: Game, dir: -1 | 1, n: number) {
  step(g, { moveX: dir, jump: true, jumpPressed: true });
  run(g, { moveX: dir, jump: true }, n);
  idle(g, 10);
}
function climb(g: Game, dir: 'up' | 'down', until: () => boolean) {
  run(g, { [dir]: true }, 1500, until);
  idle(g, 20);
  expect(until(), `${dir}: ${where(g)}\n${log.join('\n')}`).toBe(true);
}
// Терминал: E, ждать лог, выбрать по очереди все пункты, кроме последнего, затем ВЫХОД (последний).
function useTerminal(g: Game, items: number) {
  step(g, { usePressed: true });
  expect(g.screen, where(g)).not.toBeNull();
  expect(g.screen!.items).toHaveLength(items);
  idle(g, 70);
  for (let i = 0; i < items - 1; i++) {
    step(g, { jump: true, jumpPressed: true });
    step(g, {});
    step(g, { down: true, downPressed: true });
    step(g, {});
  }
  step(g, { jump: true, jumpPressed: true });
  expect(g.screen, where(g)).toBeNull();
  idle(g, 5);
}
// Подобрать предмет под ногами (K): в руках должен оказаться kind.
const pick = (g: Game, kind: string) => {
  step(g, { throwPressed: true });
  expect(g.nina.held, where(g)).toBe(kind);
};
const use = (g: Game) => step(g, { usePressed: true });

it('бункер проходится: шахта, казармы, склад, лаборатории, сейф, машинный зал, реакторная, вентиляция, выезд', () => {
  const g = createGame(loadRoomsFs('rooms2'), BUNKER_START);
  g.mission.goal = 'bomb'; // цель миссии 2 — включит план 5в.3
  idle(g, 10);
  // въезд: к будке, по люку в шахту; shaft-1: по площадке к люку x8; shaft-2: собака, вправо в казармы
  walkTo(g, 30.5);
  climb(g, 'down', () => g.roomId === 'shaft-1' && g.nina.state === 'ground');
  walkTo(g, 8.5);
  climb(g, 'down', () => g.roomId === 'shaft-2' && g.nina.state === 'ground');
  log.push(`shaft-2 ${where(g)} dog=${g.dogs.map(d => d.state)}`);
  exitTo(g, 1, 'barracks');
  // казармы: охранник на полу, по лестнице x20 на галерею, второй охранник, вправо в склад
  walkTo(g, 32);
  log.push(`barracks floor ${where(g)} guards=${g.guards.map(x => x.state)}`);
  walkTo(g, 20.5);
  run(g, {}, 900, () => g.guards[1].facing > 0 && g.guards[1].body.x > 35); // наверх — когда охранник галереи ушёл к краю спиной
  expect(g.guards[1].facing > 0 && g.guards[1].body.x > 35).toBe(true); // дождались, а не вышли по лимиту шагов
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 15);
  walkTo(g, 35);
  log.push(`barracks gallery ${where(g)} guards=${g.guards.map(x => x.state)}`);
  exitTo(g, 1, 'store');
  // склад: с галереи по лестнице x9 вниз, охранник, терминал 1 гасит камеры лабораторий и огнемёт lab-b; ключ 1 на стеллаже
  walkTo(g, 9.5);
  climb(g, 'down', () => g.nina.state === 'ground' && bot(g) > 21);
  walkTo(g, 26);
  log.push(`store ${where(g)} guards=${g.guards.map(x => x.state)}`);
  walkTo(g, 16);
  useTerminal(g, 4);
  expect([...g.mission.camerasOff].sort()).toEqual(['lab-a', 'lab-b']);
  expect(g.mission.flamersOff.has('lab-b')).toBe(true);
  expect(g.mission.checkpoint.room).toBe('store');
  walkTo(g, 27);
  jumpRun(g, 1, 20);
  walkTo(g, 34);
  pick(g, 'key1');
  log.push(`key1 ${where(g)}`);
  // назад: со стеллажа, по лестнице на галерею, через казармы в шахту, вниз в shaft-3
  walkTo(g, 28);
  walkTo(g, 9.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 15);
  exitTo(g, -1, 'barracks');
  walkTo(g, 20.5);
  climb(g, 'down', () => g.nina.state === 'ground' && bot(g) > 21);
  exitTo(g, -1, 'shaft-2');
  walkTo(g, 30.5);
  climb(g, 'down', () => g.roomId === 'shaft-3' && g.nina.state === 'ground');
  // ярус 2: камеры погашены — лаборатории насквозь, андроид и собака; дверь 1 ключом 1
  exitTo(g, 1, 'lab-a');
  log.push(`lab-a ${where(g)} android=${g.androids.map(a => a.state)}`);
  exitTo(g, 1, 'lab-b');
  log.push(`lab-b ${where(g)} dog=${g.dogs.map(d => d.state)}`);
  exitTo(g, 1, 'vault');
  walkTo(g, 1.2);
  use(g);
  expect(g.mission.doorsOpen.has('vault#1'), where(g)).toBe(true);
  expect(g.nina.held).toBeNull();
  // сейф: ключ 2 на полу (бомба подождёт — руки одни), через постамент к люку x34, вниз в машинный зал
  walkTo(g, 12);
  pick(g, 'key2');
  walkTo(g, 16);
  jumpRun(g, 1, 40);
  walkTo(g, 34.5);
  climb(g, 'down', () => g.roomId === 'engine-1' && g.nina.state === 'ground');
  log.push(`engine-1 ${where(g)} android=${g.androids.map(a => a.state)}`);
  // машинный зал: терминал 2 гасит огнемёт и камеру engine-2; через яму влево; охранник; дверь 2 ключом 2
  walkTo(g, 27);
  useTerminal(g, 3);
  expect(g.mission.camerasOff.has('engine-2') && g.mission.flamersOff.has('engine-2')).toBe(true);
  walkTo(g, 9);
  jumpRun(g, -1, 30);
  exitTo(g, -1, 'engine-2');
  log.push(`engine-2 ${where(g)} guards=${g.guards.map(x => x.state)}`);
  exitTo(g, -1, 'reactor');
  walkTo(g, 38.9);
  use(g);
  expect(g.mission.doorsOpen.has('reactor#2'), where(g)).toBe(true);
  log.push(`door2 ${where(g)}`);
  // за бомбой: назад в сейф, на постамент, бомбу — в руки; снова вниз и в реакторную
  exitTo(g, 1, 'engine-2');
  exitTo(g, 1, 'engine-1');
  walkTo(g, 2.5);
  jumpRun(g, 1, 30);
  walkTo(g, 34.5);
  climb(g, 'up', () => g.roomId === 'vault' && g.nina.state === 'ground');
  walkTo(g, 24);
  jumpRun(g, -1, 20);
  walkTo(g, 20);
  pick(g, 'bomb');
  log.push(`bomb ${where(g)}`);
  walkTo(g, 25);
  walkTo(g, 34.5);
  climb(g, 'down', () => g.roomId === 'engine-1' && g.nina.state === 'ground');
  walkTo(g, 9);
  jumpRun(g, -1, 30);
  exitTo(g, -1, 'engine-2');
  exitTo(g, -1, 'reactor');
  walkTo(g, 20);
  use(g);
  expect(g.mission.fuse, where(g)).toBe(BOMB.fuse);
  const planted = clock(g);
  log.push(`planted ${where(g)}`);
  // отход: по лестнице x11 на галерею за ключом 3, с её края вниз к двери 3, вентиляция, шахта, въезд, мотоцикл
  walkTo(g, 11.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 15);
  walkTo(g, 6);
  pick(g, 'key3');
  run(g, { moveX: -1 }, 120, () => g.nina.state === 'ground' && bot(g) > 21);
  idle(g, 10);
  walkTo(g, 2.8);
  use(g);
  expect(g.mission.doorsOpen.has('reactor#3'), where(g)).toBe(true);
  exitTo(g, -1, 'vent');
  walkTo(g, 4.5);
  climb(g, 'up', () => g.roomId === 'shaft-3' && g.nina.state === 'ground');
  walkTo(g, 30.5);
  climb(g, 'up', () => g.roomId === 'shaft-2' && g.nina.state === 'ground');
  walkTo(g, 8.5);
  climb(g, 'up', () => g.roomId === 'shaft-1' && g.nina.state === 'ground');
  walkTo(g, 30.5);
  climb(g, 'up', () => g.roomId === 'gate' && g.nina.state === 'ground');
  walkTo(g, 5);
  use(g);
  expect(g.mission.result, where(g)).toBe('won');
  const total = clock(g), back = total - planted;
  log.push(`won ${where(g)} total=${total.toFixed(1)} back=${back.toFixed(1)} minEnergy=${minEnergy.toFixed(0)}`);
  // знающий игрок укладывается в 10 минут (таймер миссии 2 — 12, план 5в.3); отход — в 60 с из 90
  expect(total, log.join('\n')).toBeLessThan(10 * 60);
  expect(back, log.join('\n')).toBeLessThan(60);
  expect(g.mission.fuse!).toBeGreaterThan(BOMB.fuse - 60);
  won = g;
});

it('запись прохождения бункера воспроизводит его до кадра: тот же итог, та же комната, позиция и отсчёт на каждом шаге', async () => {
  expect(won, 'сначала должно пройти прохождение').not.toBeNull();
  const rec = won!.rec;
  expect(rec).toHaveLength(trace.length);
  const g = createGame(loadRoomsFs('rooms2'), BUNKER_START);
  g.mission.goal = 'bomb';
  const r = { rec: await unpackRecord(await packRecord(rec)), i: 0 };
  for (let i = 0; i < rec.length; i++) {
    stepGame(g, replayStep(r, g.mission.result !== null)!, DT);
    if (pos(g) !== trace[i]) expect(pos(g), `шаг ${i}`).toBe(trace[i]);
  }
  expect(g.mission.result).toBe('won');
  const a = missionResult(won!.mission), b = missionResult(g.mission);
  for (const k of ['time', 'seconds', 'hits', 'attacks', 'line'] as const) expect(b[k], k).toBe(a[k]);
  expect(g.mission.fuse).toBe(won!.mission.fuse);
  expect(g.rec).toEqual(rec);
});

it('гибель с бомбой в руках: бомба снова на постаменте сейфа, двери открыты, путь к точке закладки цел', () => {
  const rooms = loadRoomsFs('rooms2');
  const start = { room: 'vault', x: 20 - NINA.w / 2, bottom: 20 }; // старт — он же чекпоинт — на постаменте
  const g = createGame(rooms, start);
  g.mission.goal = 'bomb';
  g.mission.doorsOpen = new Set(['vault#1', 'reactor#2']);
  for (let i = 0; i < 10; i++) stepGame(g, IDLE, DT);
  stepGame(g, { ...IDLE, throwPressed: true }, DT);
  expect(g.nina.held).toBe('bomb');
  expect(g.items.some(i => i.kind === 'bomb')).toBe(false);
  g.nina.dead = true;
  g.nina.deadT = NINA.respawnDelay;
  stepGame(g, { ...IDLE, jump: true, jumpPressed: true }, DT);
  expect(g.nina.dead).toBe(false);
  expect(g.nina.held).toBeNull();
  expect(g.roomId).toBe('vault');
  expect(g.items.filter(i => i.kind === 'bomb')).toHaveLength(1);
  expect([...g.mission.doorsOpen].sort()).toEqual(['reactor#2', 'vault#1']);
  expect(g.mission.fuse).toBeNull();
  const reach = routeDamage(rooms, [start], new Set([1, 2]));
  expect([...reach.keys()].some(k => k.startsWith('S|reactor|') && k.endsWith('|22') && Math.abs(Number(k.split('|')[2]) + 1 - 20) <= MISSION.useRange)).toBe(true);
});

it('гибель с бомбой в другой комнате: после респауна бомба снова в сейфе, ровно одна, руки пусты', () => {
  const rooms = loadRoomsFs('rooms2');
  const g = createGame(rooms, { room: 'vault', x: 20 - NINA.w / 2, bottom: 20 }); // чекпоинт — постамент сейфа
  g.mission.goal = 'bomb';
  g.mission.doorsOpen = new Set(['vault#1']);
  idle(g, 10);
  pick(g, 'bomb');
  walkTo(g, 25);
  walkTo(g, 34.5);
  climb(g, 'down', () => g.roomId === 'engine-1' && g.nina.state === 'ground');
  expect(g.nina.held).toBe('bomb');
  g.nina.dead = true;
  g.nina.deadT = NINA.respawnDelay;
  stepGame(g, { ...IDLE, jump: true, jumpPressed: true }, DT);
  expect(g.nina.dead).toBe(false);
  expect(g.roomId).toBe('vault');
  expect(g.nina.held).toBeNull();
  expect(g.heldId).toBeNull();
  const bombs = g.items.filter(i => i.kind === 'bomb');
  expect(bombs).toHaveLength(1);
  expect([bombs[0].x, bombs[0].bottom]).toEqual([20, 20]);
});
