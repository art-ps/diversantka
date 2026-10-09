import { expect, it } from 'vitest';
import { DT, MISSION } from '../src/config';
import { createPrologue, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { gliderAt } from '../src/sim/glider';
import { formatTime, missionResult } from '../src/sim/mission';
import { loadRoomsFs } from './helpers';

const log: string[] = [];
let frames = 0;
let atkToggle = false;

const cx = (g: Game) => g.nina.body.x + g.nina.body.w / 2;
const bot = (g: Game) => g.nina.body.y + g.nina.body.h;
const where = (g: Game) => `${g.roomId} x=${cx(g).toFixed(2)} b=${bot(g).toFixed(2)} st=${g.nina.state} e=${g.nina.energy.toFixed(0)} hits=${g.mission.hits} t=${formatTime(g.mission.timeLeft)} tapes=${g.mission.tapes.size}`;

// Шаг с автозащитой: враг рядом на том же полу — удар ногой.
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
  if (g.nina.dead) {
    // ждём возрождения
    for (let i = 0; i < 70; i++) { stepGame(g, IDLE, DT); frames++; }
    stepGame(g, { ...IDLE, jump: true, jumpPressed: true }, DT); frames++;
    log.push(`RESPAWN ${where(g)}`);
  }
}
const run = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) step(g, p);
};
const idle = (g: Game, n = 10) => run(g, {}, n);

function walkTo(g: Game, x: number, max = 900) {
  const room = g.roomId;
  for (let i = 0; i < max; i++) {
    const d = x - cx(g);
    if (Math.abs(d) < 0.25 && g.nina.state === 'ground') break;
    if (g.roomId !== room) break;
    step(g, { moveX: Math.abs(d) < 1 ? Math.sign(d) * 0.3 : Math.sign(d) });
  }
  idle(g, 20);
}
function exitTo(g: Game, dir: 1 | -1, room: string) {
  run(g, { moveX: dir }, 600, () => g.roomId === room);
  idle(g, 40);
  expect(g.roomId, where(g)).toBe(room);
}
function jumpRun(g: Game, dir: 1 | -1, n = 40) {
  step(g, { moveX: dir, jump: true, jumpPressed: true });
  run(g, { moveX: dir, jump: true }, n);
}
function climb(g: Game, dir: 'up' | 'down', until: () => boolean) {
  run(g, { [dir]: true }, 1200, until);
  idle(g, 20);
}
// Лифт power-1 ↔ garage-1: стоя на платформе, держать вверх/вниз, пока не приедет в комнату room.
function ride(g: Game, dir: 'up' | 'down', room: string) {
  run(g, { [dir]: true }, 1200, () => g.roomId === room && g.lifts[0].target === null && !g.transition);
  idle(g, 20);
  expect(g.roomId, where(g)).toBe(room);
}
// Терминал: E, ждать лог, выбрать пункт sel (вниз sel раз), прыжок; потом ВЫХОД.
function useTerminal(g: Game, sel: number, items: number) {
  step(g, { usePressed: true });
  expect(g.screen, where(g)).not.toBeNull();
  idle(g, 70);
  for (let i = 0; i < sel; i++) { step(g, { down: true, downPressed: true }); step(g, {}); }
  step(g, { jump: true, jumpPressed: true });
  const msg = g.screen!.msg;
  step(g, {});
  for (let i = sel; i < items - 1; i++) { step(g, { down: true, downPressed: true }); step(g, {}); }
  step(g, { jump: true, jumpPressed: true });
  expect(g.screen).toBeNull();
  idle(g, 5);
  return msg;
}

it('игра проходится от пролога до выезда', () => {
  const g = createPrologue(loadRoomsFs());
  // пролог: дельтаплан над крышей — отцепиться; до посадки таймер стоит
  run(g, {}, 3000, () => g.roomId === 'roof-1' && !g.transition && gliderAt(g.prologue!.d).x >= 8);
  expect(g.mission.timeLeft).toBe(MISSION.time);
  step(g, { jump: true, jumpPressed: true });
  run(g, {}, 600, () => !g.prologue);
  const landedAt = frames - 1; // кадр посадки — первый, где тикает таймер
  expect(g.roomId, where(g)).toBe('roof-1');
  expect(g.mission.checkpoint.room).toBe('roof-1');
  log.push(`landed ${where(g)}`);
  idle(g, 10);
  // крыша: к люку, по лестнице вниз в lab-1 — дальше прежний маршрут
  walkTo(g, 3.5);
  climb(g, 'down', () => g.roomId === 'lab-1' && g.nina.state === 'ground');
  log.push(`lab-1 ${where(g)}`);
  // lab-1: прыжок через шипы, андроид, лестница x30, лента 10,14
  walkTo(g, 9.5);
  jumpRun(g, 1, 45);
  log.push(`after spikes ${where(g)}`);
  walkTo(g, 30.5);
  log.push(`at ladder ${where(g)} android=${g.androids.map(a => a.state + ':' + a.hp)}`);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 15);
  log.push(`top ${where(g)}`);
  walkTo(g, 10);
  log.push(`tape1 ${where(g)}`);
  expect(g.mission.tapes.has('lab-1#t0'), where(g)).toBe(true);
  // назад: со края платформы вниз и вправо в lab-2
  exitTo(g, 1, 'lab-2');
  log.push(`lab-2 ${where(g)}`);
  // lab-2: терминал 26,22 — выключить огнемёт
  walkTo(g, 17);
  jumpRun(g, 1, 40); // через дыру x18..20
  walkTo(g, 26);
  const m1 = useTerminal(g, 0, 2);
  log.push(`term lab-2: ${m1} ${where(g)}`);
  walkTo(g, 36);
  expect(g.mission.tapes.has('lab-2#t0'), where(g)).toBe(true);
  log.push(`tape2 ${where(g)}`);
  // вниз в cave-1 по лестнице x19
  walkTo(g, 19.5);
  climb(g, 'down', () => g.roomId === 'cave-1' && g.nina.state === 'ground');
  log.push(`cave ${where(g)}`);
  walkTo(g, 3);
  expect(g.mission.tapes.has('cave-1#t0'), where(g)).toBe(true);
  log.push(`tape3 ${where(g)}`);
  walkTo(g, 19.5);
  climb(g, 'up', () => g.roomId === 'lab-2' && g.nina.state === 'ground');
  log.push(`back lab-2 ${where(g)}`);
  // лестница x8 на верхний этаж, вправо в evm-1
  walkTo(g, 21.5);
  jumpRun(g, -1, 40);
  walkTo(g, 8.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 15);
  log.push(`lab-2 upper ${where(g)}`);
  exitTo(g, 1, 'evm-1');
  log.push(`evm ${where(g)}`);
  // evm-1: шкаф x8..9 — прыжком; лента 33,11 — прыжком с места
  walkTo(g, 6);
  jumpRun(g, 1, 40);
  walkTo(g, 33);
  jumpRun(g, 0 as never, 60);
  idle(g, 20);
  expect(g.mission.tapes.has('evm-1#t0'), where(g)).toBe(true);
  log.push(`tape4 ${where(g)}`);
  exitTo(g, 1, 'power-1');
  walkTo(g, 34);
  jumpRun(g, 0 as never, 60);
  idle(g, 20);
  expect(g.mission.tapes.has('power-1#t0'), where(g)).toBe(true);
  log.push(`tape5 ${where(g)}`);
  // со платформы вниз, на лифт x26..28 → гараж
  walkTo(g, 27.5);
  ride(g, 'down', 'garage-1');
  walkTo(g, 6);
  expect(g.mission.tapes.has('garage-1#t0'), where(g)).toBe(true);
  log.push(`tape6 ${where(g)}`);
  // мотоцикл до выключения забора — не едет
  walkTo(g, 22);
  step(g, { usePressed: true });
  expect(g.mission.result).toBeNull();
  walkTo(g, 27.5);
  ride(g, 'up', 'power-1');
  // щиток до ввода лент — закрыт
  walkTo(g, 14);
  step(g, { usePressed: true });
  expect(g.mission.fenceOff).toBe(false);
  exitTo(g, -1, 'evm-1');
  walkTo(g, 20);
  const m2 = useTerminal(g, 0, 2);
  log.push(`main: ${m2} ${where(g)}`);
  expect(g.mission.tapesIn, m2).toBe(true);
  exitTo(g, 1, 'power-1');
  walkTo(g, 14);
  step(g, { usePressed: true });
  expect(g.mission.fenceOff, where(g)).toBe(true);
  walkTo(g, 27.5);
  ride(g, 'down', 'garage-1');
  walkTo(g, 22);
  step(g, { usePressed: true });
  expect(g.mission.result, where(g)).toBe('won');
  const r = missionResult(g.mission);
  log.push(`WON ${r.line} frames=${frames} (${(frames * DT).toFixed(1)} s sim)`);

  expect(MISSION.time - g.mission.timeLeft).toBeLessThan(MISSION.time);
  // время миссии — от посадки, полёт не в счёт
  expect(MISSION.time - g.mission.timeLeft).toBeCloseTo((frames - landedAt) * DT, 3);
});
