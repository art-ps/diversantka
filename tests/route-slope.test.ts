import { expect, it } from 'vitest';
import { DT, MISSION } from '../src/config';
import { createPrologue, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { flamerPhase } from '../src/sim/flamer';
import { gliderAt } from '../src/sim/glider';
import { formatTime, missionResult } from '../src/sim/mission';
import { loadRoomsFs } from './helpers';

// Второй маршрут настоящей физикой: ранний прыжок на склон — лес, пещеры, брод, двор, лифтом в корпус; без гибелей.
const log: string[] = [];
let frames = 0;
let atkToggle = false;

const cx = (g: Game) => g.nina.body.x + g.nina.body.w / 2;
const bot = (g: Game) => g.nina.body.y + g.nina.body.h;
const where = (g: Game) => `${g.roomId} x=${cx(g).toFixed(2)} b=${bot(g).toFixed(2)} st=${g.nina.state} e=${g.nina.energy.toFixed(0)} hits=${g.mission.hits} t=${formatTime(g.mission.timeLeft)} tapes=${g.mission.tapes.size}`;

// Шаг с автозащитой: враг рядом на том же полу — удар ногой (вверх + удар), стоит спиной — развернуться.
function step(g: Game, p: Partial<Intent>) {
  let it: Intent = { ...IDLE, ...p };
  if (!g.screen && !g.nina.dead && g.nina.state === 'ground') {
    const foes = [...g.androids.filter(a => a.state !== 'dead').map(a => a.body), ...g.dogs.filter(d => d.state !== 'dead').map(d => d.body)];
    for (const b of foes) {
      const dx = b.x + b.w / 2 - cx(g);
      const same = Math.abs(b.y + b.h - bot(g)) < 0.6;
      if (same && Math.abs(dx) < 2.6 && Math.sign(dx) === g.nina.facing) {
        atkToggle = !atkToggle;
        it = { ...IDLE, up: true, attackPressed: atkToggle };
        break;
      }
      if (same && Math.abs(dx) < 2.6) { it = { ...IDLE, moveX: Math.sign(dx) }; break; }
    }
  }
  const dead0 = g.nina.dead;
  stepGame(g, it, DT);
  frames++;
  if (g.nina.dead && !dead0) log.push(`DIED at ${where(g)}`);
  expect(g.nina.dead, `гибель: ${where(g)}\n${log.join('\n')}`).toBe(false);
}
const run = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) step(g, p);
};
const idle = (g: Game, n = 10) => run(g, {}, n);

// Дойти до центра x в своей комнате (у цели — медленно, чтобы не проскочить).
function walkTo(g: Game, x: number, max = 900) {
  const room = g.roomId;
  for (let i = 0; i < max; i++) {
    const d = x - cx(g);
    if (Math.abs(d) < 0.25 && g.nina.state === 'ground' && Math.abs(g.nina.body.vx) < 0.5) break;
    if (g.roomId !== room) break;
    step(g, { moveX: Math.abs(d) < 1 ? Math.sign(d) * 0.3 : Math.sign(d) });
  }
  idle(g, 20);
  expect(Math.abs(x - cx(g)), where(g)).toBeLessThan(0.5);
}
function exitTo(g: Game, dir: 1 | -1, room: string) {
  run(g, { moveX: dir }, 600, () => g.roomId === room);
  idle(g, 40);
  expect(g.roomId, where(g)).toBe(room);
}
// Прыжок с разгоном: держать прыжок и направление n кадров.
function jumpRun(g: Game, dir: -1 | 0 | 1, n = 40) {
  step(g, { moveX: dir, jump: true, jumpPressed: true });
  run(g, { moveX: dir, jump: true }, n);
  idle(g, 10);
}
function climb(g: Game, dir: 'up' | 'down', until: () => boolean) {
  run(g, { [dir]: true }, 1500, until);
  idle(g, 20);
}
// Лифт shaft-top ↔ shaft-1 ↔ shaft-2 ↔ shaft-bot: стоя на платформе, держать вверх/вниз, пока не приедет в room.
function ride(g: Game, dir: 'up' | 'down', room: string) {
  run(g, { [dir]: true }, 1500, () => g.roomId === room && g.lifts[0].target === null && !g.transition);
  idle(g, 40);
  expect(g.roomId, where(g)).toBe(room);
}
// Терминал: E, ждать лог, выбрать пункт sel (вниз sel раз), прыжок; потом ВЫХОД (последний из items).
function useTerminal(g: Game, sel: number, items: number) {
  step(g, { usePressed: true });
  expect(g.screen, where(g)).not.toBeNull();
  idle(g, 70);
  let msg = '';
  if (sel < items - 1) {
    for (let i = 0; i < sel; i++) { step(g, { down: true, downPressed: true }); step(g, {}); }
    step(g, { jump: true, jumpPressed: true });
    msg = g.screen!.msg;
    step(g, {});
    for (let i = sel; i < items - 1; i++) { step(g, { down: true, downPressed: true }); step(g, {}); }
  }
  step(g, { jump: true, jumpPressed: true });
  expect(g.screen, where(g)).toBeNull();
  idle(g, 5);
  return msg;
}
// Огнемёт комнаты: дождаться начала паузы — дальше 2 с струя молчит.
function waitFlamer(g: Game) {
  const f = g.flamers[0];
  run(g, {}, 400, () => flamerPhase(f) === 'off' && f.t < 0.05);
}
// Шаг с места на соседний камень: mx — доля скорости бега (камни в 3 клетки, через 6).
function hop(g: Game, dir: -1 | 1, mx = 1) {
  step(g, { moveX: dir * mx, jump: true, jumpPressed: true });
  run(g, { moveX: dir * mx, jump: true }, 60, () => g.nina.state === 'ground');
  idle(g, 20);
}
// E у края шахты — вызвать лифт на свой этаж и дождаться его.
function callLift(g: Game) {
  step(g, { usePressed: true });
  run(g, {}, 1500, () => g.lifts[0].target === null && g.lifts[0].rest === 0);
  idle(g, 5);
}
const has = (g: Game, id: string) => expect(g.mission.tapes.has(id), `${id}: ${where(g)}`).toBe(true);

it('второй маршрут: посадка на склон, лес, пещеры, брод, двор, лифтом в корпус, секретная, выезд', () => {
  const g = createPrologue(loadRoomsFs());
  // пролог: отцепиться над склоном
  run(g, {}, 3000, () => g.roomId === 'slope-1' && !g.transition && gliderAt(g.prologue!.d).x >= 34);
  step(g, { jump: true, jumpPressed: true });
  run(g, {}, 600, () => !g.prologue);
  const landedAt = frames - 1;
  expect(g.roomId, where(g)).toBe('slope-1');
  log.push(`landed ${where(g)}`);
  idle(g, 10);
  // склон: дверь в lab-1 заложена — в трещину x36..37 и вниз по лесу
  run(g, { moveX: 1 }, 300, () => g.roomId === 'forest-1' && g.nina.state === 'ground');
  idle(g, 10);
  // forest-1: с уступа влево по веткам, по земле вправо мимо собаки — в трещину
  run(g, { moveX: -1 }, 600, () => bot(g) > 21.9 && g.nina.state === 'ground');
  idle(g, 10);
  run(g, { moveX: 1 }, 900, () => g.roomId === 'forest-2' && g.nina.state === 'ground');
  idle(g, 10);
  log.push(`forest-2 ${where(g)}`);
  // forest-2: влево по ветвям до нижней ветки, с её правого края на землю, через колючки — в трещину x2..3
  run(g, { moveX: -1 }, 600, () => bot(g) > 15.9 && bot(g) < 16.1 && g.nina.state === 'ground');
  idle(g, 10);
  run(g, { moveX: 1 }, 600, () => bot(g) > 21.9 && g.nina.state === 'ground');
  idle(g, 10);
  walkTo(g, 11);
  jumpRun(g, -1, 30);
  run(g, { moveX: -1 }, 600, () => g.roomId === 'forest-3' && g.nina.state === 'ground');
  idle(g, 10);
  log.push(`forest-3 ${where(g)}`);
  // forest-3: вправо по ветвям до нижней, с её левого края на землю, собака, через колючки — в трещину x36..37
  run(g, { moveX: 1 }, 600, () => bot(g) > 15.9 && bot(g) < 16.1 && g.nina.state === 'ground');
  idle(g, 10);
  run(g, { moveX: -1 }, 600, () => bot(g) > 21.9 && g.nina.state === 'ground');
  idle(g, 10);
  walkTo(g, 28);
  jumpRun(g, 1, 30);
  run(g, { moveX: 1 }, 600, () => g.roomId === 'cave-in' && g.nina.state === 'ground');
  idle(g, 10);
  // cave-in: уступами влево на пол, вправо в cave-3
  run(g, { moveX: -1 }, 600, () => bot(g) > 21.9 && g.nina.state === 'ground');
  idle(g, 10);
  exitTo(g, 1, 'cave-3');
  log.push(`cave-3 ${where(g)}`);
  // cave-3: ступени слева — лента 19,16; собака справа; люк x34 в river-3
  walkTo(g, 12);
  jumpRun(g, 1, 20);
  jumpRun(g, 1, 20);
  walkTo(g, 19);
  has(g, 'cave-3#t0');
  log.push(`tape cave-3 ${where(g)}`);
  run(g, { moveX: 1 }, 120, () => bot(g) > 21.9 && g.nina.state === 'ground');
  walkTo(g, 34.5);
  climb(g, 'down', () => g.roomId === 'river-3' && g.nina.state === 'ground');
  // river-3: брод на остров — лента; провал во двор
  walkTo(g, 31.5);
  const e0 = g.nina.energy;
  run(g, { moveX: -1 }, 120, () => bot(g) > 21.9 && g.nina.state === 'ground');
  walkTo(g, 10.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 14.1);
  log.push(`ford -${(e0 - g.nina.energy).toFixed(1)} ${where(g)}`);
  walkTo(g, 6);
  has(g, 'river-3#t0');
  run(g, { moveX: -1 }, 120, () => bot(g) > 21.9 && g.nina.state === 'ground');
  idle(g, 10);
  run(g, { moveX: 1 }, 300, () => g.roomId === 'yard' && g.nina.state === 'ground');
  run(g, { moveX: 1 }, 600, () => bot(g) > 21.9 && g.nina.state === 'ground');
  exitTo(g, 1, 'garage-1');
  walkTo(g, 3);
  jumpRun(g, 1, 30);
  exitTo(g, 1, 'tunnel-1');
  walkTo(g, 12);
  waitFlamer(g);
  exitTo(g, 1, 'shaft-bot');
  log.push(`shaft-bot ${where(g)}`);
  // лифт стоит наверху: E у шахты — вызвать, наверх в цоколь
  walkTo(g, 25);
  callLift(g);
  walkTo(g, 27.5);
  ride(g, 'up', 'shaft-top');
  // evm-2 → store-3 (лента), по лестнице x9 на антресоль и в store-2, вниз по x24, фальш-пол — в секретную
  walkTo(g, 12.5);
  climb(g, 'up', () => g.roomId === 'evm-2' && g.nina.state === 'ground');
  exitTo(g, -1, 'store-3');
  walkTo(g, 37);
  jumpRun(g, -1, 20);
  walkTo(g, 31);
  has(g, 'store-3#t0');
  log.push(`tape store-3 ${where(g)}`);
  walkTo(g, 9.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 15);
  exitTo(g, -1, 'store-2');
  walkTo(g, 24.5);
  climb(g, 'down', () => g.nina.state === 'ground' && bot(g) > 21);
  walkTo(g, 16); // андроид склада: подойти — автозащита бьёт ногой
  log.push(`store-2 ${where(g)} android=${g.androids.map(a => a.state + ':' + a.hp)}`);
  walkTo(g, 25.5);
  jumpRun(g, 1, 20); // ящики x28..29
  run(g, { moveX: 1 }, 300, () => g.roomId === 'secret-1');
  run(g, {}, 120, () => g.nina.state === 'ground' && !g.transition);
  idle(g, 20);
  walkTo(g, 30.5);
  climb(g, 'down', () => g.nina.state === 'ground' && bot(g) > 21);
  walkTo(g, 16);
  expect(g.mission.secret, where(g)).toBe(true);
  log.push(`source ${where(g)}`);
  exitTo(g, 1, 'power-1');
  walkTo(g, 20);
  step(g, { usePressed: true });
  expect(g.mission.fenceOff).toBe(false); // до ввода лент — «ДОСТУП ЗАКРЫТ»
  walkTo(g, 26);
  jumpRun(g, 1, 30);
  exitTo(g, 1, 'shaft-top');
  // наверх: x12, x6 в машинный зал, влево через коридор в кабинет и архив (лента)
  walkTo(g, 12.5);
  climb(g, 'up', () => g.roomId === 'evm-2' && g.nina.state === 'ground');
  walkTo(g, 6.5);
  climb(g, 'up', () => g.roomId === 'evm-1' && g.nina.state === 'ground');
  exitTo(g, -1, 'corr-1');
  walkTo(g, 34);
  jumpRun(g, -1, 30); // шипы x29..31
  walkTo(g, 17.5);
  jumpRun(g, -1, 30); // ящик x13..15
  exitTo(g, -1, 'office');
  walkTo(g, 20);
  useTerminal(g, 0, 1);
  exitTo(g, -1, 'arch-1');
  walkTo(g, 20.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 11);
  walkTo(g, 12);
  has(g, 'arch-1#t0');
  log.push(`tape arch-1 ${where(g)}`);
  walkTo(g, 20.5);
  climb(g, 'down', () => g.nina.state === 'ground' && bot(g) > 21);
  exitTo(g, 1, 'office');
  // office → x35 в lab-2 (терминал гасит огнемёт), x3 на крышу, roof-3 (лента) и назад
  walkTo(g, 35.5);
  climb(g, 'up', () => g.roomId === 'lab-2' && g.nina.state === 'ground');
  walkTo(g, 26);
  useTerminal(g, 0, 2);
  expect(g.mission.flamersOff.has('lab-2')).toBe(true);
  walkTo(g, 3.5);
  climb(g, 'up', () => g.roomId === 'roof-1' && g.nina.state === 'ground');
  exitTo(g, 1, 'roof-2');
  walkTo(g, 5);
  jumpRun(g, 1, 40);
  walkTo(g, 26);
  jumpRun(g, 1, 30);
  exitTo(g, 1, 'roof-3');
  walkTo(g, 12.5);
  jumpRun(g, 1, 40);
  walkTo(g, 30.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 13);
  walkTo(g, 33);
  has(g, 'roof-3#t0');
  log.push(`tape roof-3 ${where(g)}`);
  walkTo(g, 30.5);
  climb(g, 'down', () => g.nina.state === 'ground' && bot(g) > 21);
  walkTo(g, 18.5);
  jumpRun(g, -1, 40);
  exitTo(g, -1, 'roof-2');
  walkTo(g, 35.5);
  jumpRun(g, -1, 30);
  walkTo(g, 14);
  jumpRun(g, -1, 40);
  exitTo(g, -1, 'roof-1');
  walkTo(g, 3.5);
  climb(g, 'down', () => g.roomId === 'lab-2' && g.nina.state === 'ground');
  // lab-2 → x8 наверх и в lab-3 (лента), в hall-1 по паузе огнемёта, x35 вниз — главная ЭВМ
  walkTo(g, 8.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 15);
  exitTo(g, 1, 'lab-3');
  walkTo(g, 11);
  run(g, { moveX: 1 }, 30, () => bot(g) > 21.9 && g.nina.state === 'ground');
  idle(g, 10);
  walkTo(g, 34.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 11);
  walkTo(g, 28);
  has(g, 'lab-3#t0');
  log.push(`tape lab-3 ${where(g)}`);
  walkTo(g, 34.5);
  climb(g, 'down', () => g.nina.state === 'ground' && bot(g) > 21);
  exitTo(g, 1, 'hall-1');
  walkTo(g, 13);
  jumpRun(g, 1, 30); // станок x15..17
  walkTo(g, 30);
  waitFlamer(g);
  walkTo(g, 35.5);
  climb(g, 'down', () => g.roomId === 'evm-1' && g.nina.state === 'ground');
  walkTo(g, 30.5);
  jumpRun(g, -1, 30);
  walkTo(g, 20);
  const m = useTerminal(g, 1, 3);
  expect(g.mission.tapesIn, m).toBe(true);
  log.push(`main: ${m} ${where(g)}`);
  // вниз к щитку, лифт до дна, тоннель, мотоцикл
  walkTo(g, 13.5);
  jumpRun(g, -1, 30);
  walkTo(g, 6.5);
  climb(g, 'down', () => g.roomId === 'evm-2' && g.nina.state === 'ground');
  walkTo(g, 12.5);
  climb(g, 'down', () => g.roomId === 'shaft-top' && g.nina.state === 'ground');
  exitTo(g, -1, 'power-1');
  walkTo(g, 32.5);
  jumpRun(g, -1, 30);
  walkTo(g, 20);
  step(g, { usePressed: true });
  expect(g.mission.fenceOff, where(g)).toBe(true);
  walkTo(g, 26);
  jumpRun(g, 1, 30);
  exitTo(g, 1, 'shaft-top');
  walkTo(g, 27.5);
  ride(g, 'down', 'shaft-bot');
  exitTo(g, -1, 'tunnel-1');
  walkTo(g, 28);
  waitFlamer(g);
  exitTo(g, -1, 'garage-1');
  walkTo(g, 20);
  step(g, { usePressed: true });
  expect(g.mission.result, where(g)).toBe('won');
  const r = missionResult(g.mission);
  expect(r.tapes).toBe('6/6');
  expect(r.secret).toBe(true);
  const spent = MISSION.time - g.mission.timeLeft;
  expect(spent).toBeCloseTo((frames - landedAt) * DT, 3);
  expect(spent, `${r.line}\n${log.join('\n')}`).toBeLessThan(6 * 60);
});
