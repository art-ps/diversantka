import { describe, expect, it } from 'vitest';
import { DT, MISSION, NINA } from '../src/config';
import { createGame, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { drawGame } from '../src/render/scene';
import { wrap } from '../src/render/screens';
import { SAVE, saveResult } from '../src/save';
import { missionResult } from '../src/sim/mission';
import { createNina } from '../src/sim/nina';
import type { Room } from '../src/world/room';
import { parseFence } from '../src/world/spawns';
import { FLOOR, roomOf } from './helpers';

const R = (id: string, meta: Record<string, string>): Room => ({ ...roomOf({ 22: FLOOR }), id, meta });
const press = (g: Game, p: Partial<Intent>) => stepGame(g, { ...IDLE, ...p }, DT);
const wait = (g: Game, s: number) => { for (let i = 0; i < Math.round(s / DT); i++) stepGame(g, IDLE, DT); };
const standAt = (g: Game, x: number) => { g.nina = createNina(x - NINA.w / 2, 22); wait(g, 0.1); };
const use = (g: Game) => press(g, { usePressed: true });
const jump = (g: Game) => press(g, { jump: true, jumpPressed: true });
const texts = (g: Game) => {
  const out: string[] = [], chars: string[] = [], at: { x: number; ch: string }[] = [];
  const b = {
    push: (x: number, _y: number, ch: string) => { chars.push(ch); at.push({ x, ch }); },
    text: (_x: number, _y: number, s: string) => { out.push(s); chars.push(...s); },
  };
  drawGame(b as never, g, 1);
  return { out, chars, at };
};
const garage = () => new Map([['g', R('g', { terminals: '5,22 main', switch: '15,22', bike: '25,22', fence: '38,17..21' })]]);

it('fence: «x,верх..низ»; пусто — нет забора; кривая запись — ошибка', () => {
  expect(parseFence('38,17..21', 'g')).toEqual({ x: 38, top: 17, bottom: 21 });
  expect(parseFence(undefined, 'g')).toBeNull();
  expect(() => parseFence('38,21..17', 'g')).toThrow('g: плохая запись забора «38,21..17»');
});

it('порядок в игре: ленты → ЭВМ → щиток → мотоцикл → выезд → итог → заново', () => {
  const g = createGame(garage(), { room: 'g', x: 10, bottom: 22 });
  standAt(g, 25);
  use(g); // мотоцикл при включённом заборе
  expect(g.mission.result).toBeNull();
  expect(g.floaters.map(f => f.text)).toContain('ЗАБОР ПОД ТОКОМ');
  expect(g.particles.length).toBeGreaterThan(0);
  standAt(g, 15);
  use(g); // щиток до ввода лент
  expect(g.floaters.map(f => f.text)).toContain('ДОСТУП ЗАКРЫТ');
  expect(g.mission.fenceOff).toBe(false);
  for (let i = 0; i < 5; i++) g.mission.tapes.add(`x#t${i}`);
  standAt(g, 5);
  use(g);
  wait(g, MISSION.bootTime);
  jump(g); // ВВЕСТИ ЛЕНТЫ
  expect(g.screen!.msg).toBe('НЕДОСТАТОЧНО ЛЕНТ 5/6');
  expect(g.mission.tapesIn).toBe(false);
  g.mission.tapes.add('x#t5');
  jump(g);
  expect(g.screen!.msg).toBe('ЛЕНТЫ ВВЕДЕНЫ');
  expect(g.mission.checkpoint.tapesIn).toBe(true);
  press(g, { down: true, downPressed: true });
  jump(g); // ВЫХОД
  standAt(g, 15);
  use(g);
  expect(g.mission.fenceOff).toBe(true);
  expect(g.floaters.map(f => f.text)).toContain('ЗАБОР ВЫКЛЮЧЕН');
  standAt(g, 25);
  use(g);
  expect(g.mission.result).toBe('won');
  const left = g.mission.timeLeft;
  wait(g, MISSION.outroTime);
  expect(g.mission.timeLeft).toBe(left); // таймер встал
  use(g);
  expect(g.clip).toBe(missionResult(g.mission).line);
  jump(g); // рано — итог ещё на экране
  expect(g.mission.result).toBe('won');
  wait(g, MISSION.restartDelay);
  jump(g);
  expect(g.mission.result).toBeNull();
  expect(g.mission.tapes.size).toBe(0);
  expect(g.mission.timeLeft).toBe(MISSION.time);
  expect(g.nina.body.x).toBe(10);
});

it('таймер 0 — МИССИЯ ПРОВАЛЕНА; прыжок — заново, но не сразу', () => {
  const g = createGame(garage(), { room: 'g', x: 10, bottom: 22 });
  g.mission.timeLeft = DT / 2;
  stepGame(g, IDLE, DT);
  expect(g.mission.result).toBe('failed');
  expect(texts(g).out).toContain('МИССИЯ ПРОВАЛЕНА');
  jump(g);
  expect(g.mission.result).toBe('failed');
  wait(g, MISSION.restartDelay);
  jump(g);
  expect(g.mission.result).toBeNull();
  expect(g.mission.timeLeft).toBe(MISSION.time);
});

describe('экраны конца', () => {
  const won = () => {
    const g = createGame(garage(), { room: 'g', x: 10, bottom: 22 });
    g.mission.tapesIn = true;
    g.mission.fenceOff = true;
    standAt(g, 25);
    use(g);
    return g;
  };

  it('выезд: мотоцикл едет влево — от ворот гаража по дороге', () => {
    const g = won();
    const bikeX = () => Math.min(...texts(g).at.filter(p => p.ch === 'o').map(p => p.x));
    wait(g, 0.5);
    const x0 = bikeX();
    wait(g, 1.5);
    expect(bikeX()).toBeLessThan(x0);
  });

  it('итог: заголовок, время, ленты, удары, источник, строка; символы — из атласа', () => {
    const g = won();
    g.mission.hits = 2;
    wait(g, MISSION.outroTime + 0.1);
    const { out, chars } = texts(g);
    const r = missionResult(g.mission);
    expect(out).toContain('МИССИЯ ВЫПОЛНЕНА');
    expect(out).toContain(`ВРЕМЯ   ${r.time}`);
    expect(out).toContain('ЛЕНТЫ   0/6');
    expect(out).toContain('УДАРОВ  2');
    expect(out).toContain('ИСТОЧНИК НАЙДЕН: НЕТ');
    expect(out.join(' ')).toContain('Диверсантка · миссия выполнена за');
    for (const ch of chars) expect(CHARSET).toContain(ch);
  });

  it('щиток, мотоцикл и забор рисуются в комнате', () => {
    const g = createGame(garage(), { room: 'g', x: 10, bottom: 22 });
    const { chars } = texts(g);
    for (const ch of ['▓', 'o', '|', '+']) expect(chars).toContain(ch);
  });
});

it('wrap: по словам, не длиннее n', () => {
  const lines = wrap(missionResult(createGame(garage(), { room: 'g', x: 10, bottom: 22 }).mission).line, 45);
  expect(lines.length).toBeGreaterThan(1);
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(45);
});

describe('localStorage', () => {
  it('пишет «пройдено», «секрет» — только если найден', () => {
    const data = new Map<string, string>();
    const s = { setItem: (k: string, v: string) => { data.set(k, v); } };
    saveResult(s, false);
    expect([...data.keys()]).toEqual([SAVE.done]);
    saveResult(s, true);
    expect(data.get(SAVE.secret)).toBe('1');
  });

  it('бросающее или отсутствующее хранилище не ломает игру', () => {
    expect(() => saveResult({ setItem: () => { throw new Error('quota'); } }, true)).not.toThrow();
    expect(() => saveResult(undefined, true)).not.toThrow();
  });
});
