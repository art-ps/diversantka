import { expect, it } from 'vitest';
import { DT, FLAMER, MISSION, NINA, SFX } from '../src/config';
import { createGame, createPrologue, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { gliderAt } from '../src/sim/glider';
import { createNina } from '../src/sim/nina';
import type { Sfx } from '../src/sim/sfx';
import type { Room } from '../src/world/room';
import { FLOOR, loadRoomsFs, roomOf } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const R = (id: string, meta: Record<string, string>, rows: Record<number, string> = { 22: FLOOR }, exits: Room['exits'] = {}): Room => ({ ...roomOf(rows, exits), id, meta });
// n шагов, нажатие — только в первом; звуки за эти шаги (g.sfx очищается, как в main.ts).
const sounds = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false): Sfx[] => {
  g.sfx.length = 0;
  for (let i = 0; i < n && !until(); i++) stepGame(g, I(i === 0 ? p : { ...p, jumpPressed: false, usePressed: false, pausePressed: false, upPressed: false, downPressed: false }), DT);
  return [...g.sfx];
};
const count = (s: Sfx[], k: Sfx) => s.filter(x => x === k).length;
const standAt = (g: Game, x: number) => { g.nina = createNina(x - NINA.w / 2, 22); sounds(g, {}, 6); };

it('ЭВМ: щелчки печати лога только пока он печатается; писк на шаг курсора и на выбор', () => {
  const g = createGame(new Map([['a', R('a', { terminals: '20,22 controls=a', enemies: 'flamer@38,19 dir=left' })]]), { room: 'a', x: 2, bottom: 22 });
  standAt(g, 20);
  const boot = sounds(g, { usePressed: true }, Math.round(MISSION.bootTime / DT) + 30);
  const n = Math.floor(MISSION.bootTime / SFX.typeEvery);
  expect(count(boot, 'type')).toBeGreaterThanOrEqual(n - 1);
  expect(count(boot, 'type')).toBeLessThanOrEqual(n + 1);
  expect(boot.filter(k => k !== 'type')).toEqual([]);
  expect(sounds(g, { down: true, downPressed: true }, 1)).toEqual(['menuMove']);
  expect(sounds(g, { jump: true, jumpPressed: true }, 1)).toEqual(['menuSelect']);
});

// Шахта в колонках 18..20: этажи «a» строки 10 и 22, этаж «b» строка 22 (47).
const GAP = '#'.repeat(18) + '...' + '#'.repeat(19);
const shaft = () => new Map<string, Room>([
  ['a', R('a', { lift: '18 10..47 floors=22' }, { 10: GAP, 22: GAP, 23: GAP, 24: GAP }, { down: 'b' })],
  ['b', R('b', {}, { 0: GAP, 22: FLOOR }, { up: 'a' })],
]);
const onLift = () => {
  const g = createGame(shaft(), { room: 'a', x: 19.5 - NINA.w / 2, bottom: 10 });
  sounds(g, {}, 5);
  return g;
};

it('лифт: гул с начала до конца пути, стук на этаже — по одному разу', () => {
  const g = onLift();
  const s = sounds(g, { down: true }, 2);
  expect(s).toEqual(['liftStart']);
  const ride = sounds(g, {}, 600, () => g.lifts[0].target === null);
  ride.push(...sounds(g, {}, 5));
  expect(count(ride, 'liftFloor')).toBe(1);
  expect(count(ride, 'liftStop')).toBe(1);
  expect(count(ride, 'liftStart')).toBe(0);
});

it('пауза и гибель глушат гул лифта; после паузы он возвращается', () => {
  const g = onLift();
  sounds(g, { down: true }, 2);
  expect(sounds(g, { pausePressed: true }, 1)).toEqual(['liftStop']);
  expect(sounds(g, {}, 30)).toEqual([]);
  expect(sounds(g, { pausePressed: true }, 1)).toEqual(['liftStart']);
  g.nina.dead = true;
  expect(sounds(g, {}, 1)).toEqual(['liftStop']);
});

it('огнемёт: за цикл — предупреждение, струя вкл и выкл; выключенный молчит', () => {
  const g = createGame(new Map([['f', R('f', { enemies: 'flamer@38,19 dir=left' })]]), { room: 'f', x: 2, bottom: 22 });
  const s = sounds(g, {}, Math.round((FLAMER.off + FLAMER.on) / DT) + 5);
  expect(count(s, 'flamerWarn')).toBe(1);
  expect(count(s, 'jetOn')).toBe(1);
  expect(count(s, 'jetOff')).toBe(1);
  expect(s.indexOf('flamerWarn')).toBeLessThan(s.indexOf('jetOn'));
  g.flamers[0].off = true;
  expect(sounds(g, {}, Math.round((FLAMER.off + FLAMER.on) / DT))).toEqual([]);
});

it('щиток, забор под током, выезд', () => {
  const g = createGame(new Map([['g', R('g', { switch: '15,22', bike: '25,22', fence: '38,17..21' })]]), { room: 'g', x: 10, bottom: 22 });
  standAt(g, 25);
  expect(sounds(g, { usePressed: true }, 1)).toEqual(['zap']);
  standAt(g, 15);
  expect(sounds(g, { usePressed: true }, 1)).toEqual(['switch']);
  g.mission.tapesIn = true;
  sounds(g, { usePressed: true }, 1);
  standAt(g, 25);
  expect(sounds(g, { usePressed: true }, 1)).toEqual(['bike']);
});

it('пролог: удар о мачту и всплеск в море — по разу, обычного всплеска нет', () => {
  const crash = createPrologue(loadRoomsFs());
  const s = sounds(crash, {}, 3000, () => crash.prologue!.phase === 'crash');
  s.push(...sounds(crash, {}, 30));
  expect(count(s, 'mast')).toBe(1);
  const sea = createPrologue(loadRoomsFs());
  sounds(sea, {}, 3000, () => sea.roomId === 'sea-1' && gliderAt(sea.prologue!.d).x >= 10);
  const fall = sounds(sea, { jump: true, jumpPressed: true }, 600, () => sea.prologue!.phase === 'splash');
  fall.push(...sounds(sea, {}, 30));
  expect(count(fall, 'seaSplash')).toBe(1);
  expect(fall).not.toContain('splash');
});

it('экран ЭВМ глушит струю огнемёта; выход — струя звучит снова', () => {
  const g = createGame(new Map([['f', R('f', { terminals: '10,22', enemies: 'flamer@38,19 dir=left' })]]), { room: 'f', x: 2, bottom: 22 });
  standAt(g, 10);
  g.flamers[0].t = FLAMER.off + 0.01;
  expect(sounds(g, {}, 1)).toEqual(['jetOn']);
  expect(sounds(g, { usePressed: true }, 1)).toEqual(['jetOff']);
  sounds(g, {}, Math.round(MISSION.bootTime / DT) + 1);
  expect(sounds(g, { jump: true, jumpPressed: true }, 1)).toEqual(['menuSelect', 'jetOn']);
});
