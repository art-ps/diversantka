import { expect, it } from 'vitest';
import { BOMB, CAMERA, DT, MISSION } from '../src/config';
import { createGame, liveRoom, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { decodeIntent } from '../src/sim/record';
import type { Room } from '../src/world/room';
import { validateDoors } from '../src/world';
import { FLOOR, roomOf } from './helpers';
import { doorRoute } from './reach';

// Две тестовые комнаты, пол — строка 22.
// a: мотоцикл у x = 4, ключ 1 у x = 10, дверь 1 в колонке 20, за ней охранник (участок 26..36) и бомба у x = 34; выход вправо.
// b: решётка в колонке 3, камера над x = 12 смотрит вниз, точка закладки у x = 20, терминал у x = 24 гасит камеры b.
const column = (x: number, ch: string): Record<number, string> => {
  const rows: Record<number, string> = { 22: FLOOR };
  for (let r = 1; r < 22; r++) rows[r] = '.'.repeat(x) + (r < 18 ? '#' : ch);
  return rows;
};
const room = (id: string, rows: Record<number, string>, meta: Record<string, string>, exits: Room['exits']): Room => ({ ...roomOf(rows, exits), id, meta });
const world = () => new Map([
  ['a', room('a', column(20, '1'), { bike: '4,22', items: 'key1@10,22 ; bomb@34,22', enemies: 'guard@30,22 patrol=26..36' }, { right: 'b' })],
  ['b', room('b', column(3, 'A'), { cameras: '12,15 arc=-10..10 period=2', bomb: '20,22', terminals: '24,22 controls=b' }, { left: 'a' })],
]);
const START = { room: 'a', x: 2, bottom: 22 };

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
// Состояние после шага — для сравнения с реплеем: комната, позиция, тревога, решётка, отсчёт, охрана.
const trace = (g: Game) => `${g.roomId} ${g.nina.body.x} ${g.nina.body.y} ${g.alarmT} ${g.gate} ${g.mission.fuse} ${g.guards.map(gd => gd.state).join()}`;
let log: string[] | null = null; // play() пишет сюда trace каждого шага
const step = (g: Game, p: Partial<Intent> = {}) => {
  stepGame(g, I(p), DT);
  log?.push(trace(g));
};
const wait = (g: Game, s: number) => { for (let i = 0; i < Math.round(s / DT); i++) step(g); };
const cx = (g: Game) => g.nina.body.x + g.nina.body.w / 2;
// Подойти к x в комнате id (стик пропорционально расстоянию — без перелёта), затем постоять.
const walkTo = (g: Game, id: string, x: number) => {
  for (let i = 0; i < 60 * 20; i++) {
    if (g.roomId === id && Math.abs(cx(g) - x) < 0.15 && Math.abs(g.nina.body.vx) < 0.5) break;
    const dir = g.roomId === id ? x - cx(g) : id === 'b' ? 1 : -1;
    step(g, { moveX: Math.max(-1, Math.min(1, dir / 2)) });
  }
  expect(g.roomId).toBe(id);
  expect(Math.abs(cx(g) - x)).toBeLessThan(0.15);
  wait(g, 0.1);
};
const use = (g: Game) => step(g, { usePressed: true });

// Сквозной маршрут механик 5в.1; возвращает игру после выезда.
function play(): Game {
  const g = createGame(world(), START);
  g.mission.goal = 'bomb'; // цель миссии 2 — включит план 5в.3
  wait(g, 0.2);
  // Ключ → дверь: охранник за закрытой дверью героиню не видит.
  walkTo(g, 'a', 10);
  step(g, { throwPressed: true });
  expect(g.nina.held).toBe('key1');
  walkTo(g, 'a', 19.2);
  expect(g.guards[0].state).toBe('patrol');
  use(g);
  expect(g.mission.doorsOpen.has('a#1')).toBe(true);
  // Охранник: подойти вплотную и бить, пока не рассыплется.
  for (let i = 0; i < 60 * 6 && g.guards[0].state !== 'dead'; i++) {
    const d = g.guards[0].body.x + g.guards[0].body.w / 2 - cx(g);
    step(g, Math.abs(d) > 1.8 ? { moveX: Math.sign(d) } : { attackPressed: i % 2 === 0 });
  }
  expect(g.guards[0].state).toBe('dead');
  expect(g.nina.dead).toBe(false);
  // Бомба — в руки, в комнату b; под камерой — тревога, решётка за спиной опускается.
  walkTo(g, 'a', 34);
  step(g, { throwPressed: true });
  expect(g.nina.held).toBe('bomb');
  walkTo(g, 'b', 12);
  wait(g, 0.5);
  expect(g.alarmT).toBeGreaterThan(0);
  wait(g, CAMERA.gateTime);
  for (let r = 18; r < 22; r++) expect(liveRoom(g).tiles[r][3]).toBe('#');
  // Закладка, камеры — с терминала, переждать тревогу, назад к мотоциклу.
  walkTo(g, 'b', 20);
  use(g);
  expect(g.mission.fuse).not.toBeNull();
  walkTo(g, 'b', 24);
  use(g);
  wait(g, MISSION.bootTime);
  step(g, { jumpPressed: true, jump: true }); // ОТКЛ. КАМЕРЫ b
  step(g, { downPressed: true });
  step(g, { jumpPressed: true, jump: true }); // ВЫХОД
  expect(g.screen).toBeNull();
  for (let i = 0; i < 60 * (CAMERA.alarm + 1) && g.gate > 0; i++) step(g);
  expect(g.gate).toBe(0);
  walkTo(g, 'a', 4);
  use(g);
  expect(g.mission.result).toBe('won');
  expect(g.mission.fuse!).toBeGreaterThan(BOMB.fuse - 60);
  return g;
}

it('тестовая карта: двери и ключи сходятся, маршрут «ключ → дверь» достижим', () => {
  expect(validateDoors(world())).toEqual([]);
  expect(doorRoute(world(), [START])).toEqual([]);
});

it('сквозной маршрут: ключ → дверь → охранник → бомба → тревога и решётка → закладка → терминал → мотоцикл', () => {
  const g = play();
  expect(g.mission.attacks).toBeGreaterThanOrEqual(2);
  expect(g.killed.size).toBe(1);
});

it('реплей того же маршрута повторяет его до кадра: тревога, решётка, отсчёт, охрана, позиция', () => {
  const played: string[] = [];
  log = played;
  const won = play();
  log = null;
  expect(played).toHaveLength(won.rec.length); // каждый шаг маршрута записан
  const g = createGame(world(), START);
  g.mission.goal = 'bomb';
  for (let i = 0; i < won.rec.length; i++) {
    stepGame(g, decodeIntent(won.rec[i]), DT);
    if (trace(g) !== played[i]) expect(`${i}: ${trace(g)}`).toBe(`${i}: ${played[i]}`);
  }
  expect(g.mission.result).toBe('won');
  expect(g.mission.timeLeft).toBe(won.mission.timeLeft);
  expect(g.mission.fuse).toBe(won.mission.fuse);
  expect(g.rec).toEqual(won.rec);
});
