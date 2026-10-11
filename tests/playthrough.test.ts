import { expect, it } from 'vitest';
import { DT, MISSION } from '../src/config';
import { createPrologue, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { gliderAt } from '../src/sim/glider';
import { formatTime, missionResult } from '../src/sim/mission';
import { loadRoomsFs } from './helpers';

// Сквозное прохождение корпуса настоящей физикой: сценарий «знающего игрока» без гибелей.
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
// Лифт shaft-top ↔ cave-1 ↔ garage-1: стоя на платформе, держать вверх/вниз, пока не приедет в room.
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
const has = (g: Game, id: string) => expect(g.mission.tapes.has(id), `${id}: ${where(g)}`).toBe(true);

it('игра проходится от пролога до выезда через корпус НИИ', () => {
  const g = createPrologue(loadRoomsFs());
  // пролог: над крышей отцепиться; до посадки таймер стоит
  run(g, {}, 3000, () => g.roomId === 'roof-1' && !g.transition && gliderAt(g.prologue!.d).x >= 8);
  expect(g.mission.timeLeft).toBe(MISSION.time);
  step(g, { jump: true, jumpPressed: true });
  run(g, {}, 600, () => !g.prologue);
  const landedAt = frames - 1; // кадр посадки — первый, где тикает таймер
  expect(g.roomId, where(g)).toBe('roof-1');
  log.push(`landed ${where(g)}`);
  idle(g, 10);

  // крыша: сквозь основание мачты на roof-2, через короб и будку на roof-3
  exitTo(g, 1, 'roof-2');
  walkTo(g, 5);
  jumpRun(g, 1, 40);
  walkTo(g, 26);
  jumpRun(g, 1, 30);
  log.push(`roof-2 booth ${where(g)}`);
  exitTo(g, 1, 'roof-3');
  // roof-3: через горящий кабель, по лестнице к баку — лента 33,12
  walkTo(g, 12.5);
  jumpRun(g, 1, 40);
  walkTo(g, 30.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 13);
  walkTo(g, 33);
  has(g, 'roof-3#t0');
  log.push(`tape roof-3 ${where(g)}`);
  // назад: с бака по лестнице, через кабель, будку и короб к люку roof-1 → lab-2
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
  log.push(`lab-2 ${where(g)}`);
  // lab-2: терминал гасит огнемёт у люка вниз; по лестнице x8 наверх и в lab-3
  walkTo(g, 26);
  log.push(`term lab-2: ${useTerminal(g, 0, 2)} ${where(g)}`);
  expect(g.mission.flamersOff.has('lab-2')).toBe(true);
  walkTo(g, 8.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 15);
  exitTo(g, 1, 'lab-3');
  // lab-3: с уступа вниз, андроид, лестница x34 к полке — лента 28,10
  walkTo(g, 11);
  run(g, { moveX: 1 }, 30, () => bot(g) > 21.9 && g.nina.state === 'ground');
  idle(g, 10);
  log.push(`lab-3 floor ${where(g)}`);
  walkTo(g, 34.5);
  log.push(`lab-3 ladder ${where(g)} android=${g.androids.map(a => a.state + ':' + a.hp)}`);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 11);
  walkTo(g, 28);
  has(g, 'lab-3#t0');
  log.push(`tape lab-3 ${where(g)}`);
  walkTo(g, 34.5);
  climb(g, 'down', () => g.nina.state === 'ground' && bot(g) > 21);
  walkTo(g, 10.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 15);
  exitTo(g, -1, 'lab-2');
  // назад в lab-2: по лестнице x8 вниз, к люку x35 — в office
  walkTo(g, 8.5);
  climb(g, 'down', () => g.nina.state === 'ground' && bot(g) > 21);
  walkTo(g, 35.5);
  climb(g, 'down', () => g.roomId === 'office' && g.nina.state === 'ground');
  log.push(`office ${where(g)}`);
  // office: терминал — чекпоинт; влево в архив
  walkTo(g, 20);
  useTerminal(g, 0, 1);
  expect(g.mission.checkpoint.room).toBe('office');
  exitTo(g, -1, 'arch-1');
  // arch-1: по лестнице x20 на верхний стеллаж — лента 12,10; вниз по люку x4 в store-1
  walkTo(g, 20.5);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 11);
  walkTo(g, 12);
  has(g, 'arch-1#t0');
  log.push(`tape arch-1 ${where(g)}`);
  walkTo(g, 20.5);
  climb(g, 'down', () => g.nina.state === 'ground' && bot(g) > 21);
  walkTo(g, 4.5);
  climb(g, 'down', () => g.roomId === 'store-1' && g.nina.state === 'ground');
  log.push(`store-1 ${where(g)}`);
  // store-1: терминал — чекпоинт; по ящикам вправо в store-2
  walkTo(g, 20);
  useTerminal(g, 0, 1);
  walkTo(g, 26);
  jumpRun(g, 1, 20);
  log.push(`crate1 ${where(g)}`);
  jumpRun(g, 1, 20);
  log.push(`crate2 ${where(g)}`);
  exitTo(g, 1, 'store-2');
  log.push(`store-2 ${where(g)}`);
  // store-2: андроид у двери, по лестнице x24 на антресоль и вправо в store-3
  walkTo(g, 24.5);
  log.push(`store-2 ladder ${where(g)} android=${g.androids.map(a => a.state + ':' + a.hp)}`);
  climb(g, 'up', () => g.nina.state === 'ground' && bot(g) < 15);
  exitTo(g, 1, 'store-3');
  // store-3: с уступа по лестнице x9, собака, на штабель — лента 31,19; дальше в evm-2
  walkTo(g, 9.5);
  climb(g, 'down', () => g.nina.state === 'ground' && bot(g) > 21);
  walkTo(g, 27.5);
  log.push(`store-3 crates ${where(g)} dog=${g.dogs.map(d => d.state)}`);
  jumpRun(g, 1, 20);
  walkTo(g, 31);
  has(g, 'store-3#t0');
  log.push(`tape store-3 ${where(g)}`);
  exitTo(g, 1, 'evm-2');
  // evm-2 → по люку x12 в shaft-top; лифт вниз: пещера (лента 3,23), гараж (лента 6,22)
  walkTo(g, 12.5);
  climb(g, 'down', () => g.roomId === 'shaft-top' && g.nina.state === 'ground');
  log.push(`shaft-top ${where(g)}`);
  walkTo(g, 27.5);
  ride(g, 'down', 'cave-1');
  log.push(`cave ${where(g)}`);
  walkTo(g, 3);
  has(g, 'cave-1#t0');
  log.push(`tape cave ${where(g)}`);
  walkTo(g, 27.5);
  ride(g, 'down', 'garage-1');
  walkTo(g, 6);
  has(g, 'garage-1#t0');
  log.push(`tape garage ${where(g)}`);
  // мотоцикл до выключения забора не едет
  walkTo(g, 22);
  step(g, { usePressed: true });
  expect(g.mission.result).toBeNull();
  // наверх: лифт до shaft-top, лестницы x12 и x6 — в машинный зал
  walkTo(g, 27.5);
  ride(g, 'up', 'shaft-top');
  walkTo(g, 12.5);
  climb(g, 'up', () => g.roomId === 'evm-2' && g.nina.state === 'ground');
  walkTo(g, 6.5);
  climb(g, 'up', () => g.roomId === 'evm-1' && g.nina.state === 'ground');
  log.push(`evm-1 ${where(g)}`);
  jumpRun(g, 1, 30); // через шкаф x10..11
  walkTo(g, 20);
  const m = useTerminal(g, 1, 3);
  log.push(`main: ${m} ${where(g)}`);
  expect(g.mission.tapesIn, m).toBe(true);
  // вниз к щитку: x6, x12, влево в power-1
  walkTo(g, 13.5);
  jumpRun(g, -1, 30);
  walkTo(g, 6.5);
  climb(g, 'down', () => g.roomId === 'evm-2' && g.nina.state === 'ground');
  walkTo(g, 12.5);
  climb(g, 'down', () => g.roomId === 'shaft-top' && g.nina.state === 'ground');
  exitTo(g, -1, 'power-1');
  walkTo(g, 32.5);
  jumpRun(g, -1, 30); // через трансформатор x28..30
  walkTo(g, 20);
  step(g, { usePressed: true });
  expect(g.mission.fenceOff, where(g)).toBe(true);
  log.push(`switch ${where(g)}`);
  walkTo(g, 26);
  jumpRun(g, 1, 30);
  exitTo(g, 1, 'shaft-top');
  walkTo(g, 27.5);
  ride(g, 'down', 'garage-1');
  walkTo(g, 22);
  step(g, { usePressed: true });
  expect(g.mission.result, where(g)).toBe('won');
  const r = missionResult(g.mission);
  expect(r.tapes).toBe('6/6');
  // время миссии — от посадки, полёт не в счёт; знающий игрок укладывается в 6 минут из 15
  const spent = MISSION.time - g.mission.timeLeft;
  expect(spent).toBeCloseTo((frames - landedAt) * DT, 3);
  expect(spent, `${r.line}\n${log.join('\n')}`).toBeLessThan(6 * 60);
});
