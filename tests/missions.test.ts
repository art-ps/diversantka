import { describe, expect, it } from 'vitest';
import { DT, MISSION, NINA, PROLOGUE, ROOM_W } from '../src/config';
import { createGame, createPrologue, stepGame, type Game } from '../src/game';
import { setLang, STR, type Lang } from '../src/i18n';
import { IDLE, type Intent } from '../src/input/intent';
import { MISSIONS } from '../src/missions';
import { drawGame, hudCell, hudWidth } from '../src/render/scene';
import { gliderAt, ROUTE } from '../src/sim/glider';
import { createMission, elapsed, formatTime, missionResult, plantBomb, restoreCheckpoint, saveCheckpoint, tickTimer } from '../src/sim/mission';
import { BUNKER_START, validateMission } from '../src/world';
import type { Room } from '../src/world/room';
import { FLOOR, loadRoomsFs, roomOf } from './helpers';

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const run = (g: Game, it: Intent, n: number) => { for (let i = 0; i < n; i++) stepGame(g, it, DT); };
const R = (id: string, meta: Record<string, string>): Room => ({ ...roomOf({ 22: FLOOR }), id, meta });
const START = { room: 'a', x: 4, bottom: 22 };

describe('MISSIONS', () => {
  it('1 — база: ленты, 15 минут, старт под дельтапланом; 2 — бункер: бомба, 12 минут, въезд справа от мотоцикла', () => {
    const a = gliderAt(PROLOGUE.startD);
    expect(MISSIONS[1]).toEqual({ rooms: 1, start: { room: ROUTE[a.screen], x: a.x - NINA.w / 2, bottom: a.bottom }, time: 15 * 60, goal: 'tapes' });
    expect(MISSIONS[2]).toEqual({ rooms: 2, start: { room: 'gate', x: 9, bottom: 22 }, time: 12 * 60, goal: 'bomb' });
    expect(BUNKER_START).toBe(MISSIONS[2].start);
  });

  it('createGame с номером миссии: цель и таймер из MISSIONS; без номера — миссия 1, как раньше', () => {
    const g2 = createGame(loadRoomsFs('rooms2'), MISSIONS[2].start, 2);
    expect(g2.missionId).toBe(2);
    expect(g2.mission.goal).toBe('bomb');
    expect(g2.mission.timeLeft).toBe(12 * 60);
    expect(g2.mission.checkpoint.timeLeft).toBe(12 * 60);
    const g1 = createGame(loadRoomsFs(), { room: 'lab-1', x: 10, bottom: 22 });
    expect(g1.missionId).toBe(1);
    expect(g1.mission.goal).toBe('tapes');
    expect(g1.mission.timeLeft).toBe(MISSION.time);
    const p = createPrologue(loadRoomsFs());
    expect(p.missionId).toBe(1);
    expect(p.start).toEqual(MISSIONS[1].start);
  });

  it('validateMission(bomb) без старта берёт комнату старта миссии 2', () => {
    const ok = new Map([['gate', R('gate', { bomb: '20,22', items: 'bomb@10,22', bike: '5,22' })]]);
    expect(validateMission(ok, 'bomb')).toEqual([]);
  });
});

describe('часы миссии', () => {
  // Время итога — побитово «длина таймера − остаток», как до часов: накопленная сумма dt расходится в младших битах,
  // и Math.ceil в formatTime на границе секунды дал бы +1 с.
  const ticks = (m: ReturnType<typeof createMission>, n: number) => { for (let i = 0; i < n; i++) tickTimer(m, DT); };
  for (const [goal, time, ks] of [['tapes', MISSION.time, [1, 2, 59, 600, 899]], ['bomb', MISSIONS[2].time, [1, 61, 719]]] as const) {
    it(`время итога (${time} с) — побитово таймер минус остаток, на границе секунды и в её середине`, () => {
      for (const k of ks) {
        const m = createMission(START, goal, time);
        ticks(m, 60 * k);
        expect(missionResult(m).seconds, `k=${k}`).toBe(time - m.timeLeft);
        expect(missionResult(m).time, `k=${k}`).toBe(formatTime(k));
        ticks(m, 30);
        expect(missionResult(m).seconds, `k=${k}.5`).toBe(time - m.timeLeft);
        expect(missionResult(m).time, `k=${k}.5`).toBe(formatTime(k + 1));
      }
    });
  }

  it('идут с таймером; итог миссии 2 считает от часов, а не от 15 минут', () => {
    const m = createMission(START, 'bomb', 12 * 60);
    for (let i = 0; i < 60; i++) tickTimer(m, 1);
    expect(elapsed(m)).toBe(60);
    expect(m.timeLeft).toBe(11 * 60);
    m.result = 'won';
    expect(missionResult(m).seconds).toBe(60);
    expect(missionResult(m).time).toBe('01:00');
  });

  it('таймер на нуле с заложенной бомбой: часы идут дальше — камеры не замирают', () => {
    const m = createMission(START, 'bomb', 10);
    plantBomb(m);
    tickTimer(m, 10);
    expect(m.timeLeft).toBe(0);
    expect(m.result).toBeNull();
    tickTimer(m, 5);
    expect(elapsed(m)).toBe(15);
    for (let i = 1; i <= 60; i++) {
      const e = elapsed(m);
      tickTimer(m, DT);
      expect(elapsed(m)).toBeCloseTo(e + DT, 12);
      expect(m.timeLeft).toBe(0);
    }
  });

  it('после итога стоят; чекпоинт откатывает их вместе с таймером', () => {
    const m = createMission(START);
    tickTimer(m, 30);
    saveCheckpoint(m, START);
    tickTimer(m, 20);
    restoreCheckpoint(m);
    expect(elapsed(m)).toBe(30);
    expect(m.timeLeft).toBe(MISSION.time - 30);
    m.result = 'failed';
    tickTimer(m, 5);
    expect(elapsed(m)).toBe(30);
  });

  it('чекпоинт откатывает и перебег после нуля таймера', () => {
    const m = createMission(START, 'bomb', 10);
    plantBomb(m);
    tickTimer(m, 12);
    saveCheckpoint(m, START);
    tickTimer(m, 5);
    expect(elapsed(m)).toBe(17);
    restoreCheckpoint(m);
    expect(m.timeLeft).toBe(0);
    expect(elapsed(m)).toBe(12);
  });

  it('пауза часы не двигает, экран ЭВМ — двигает', () => {
    const g = createGame(new Map([['a', R('a', { terminals: '10,22' })]]), START);
    run(g, IDLE, 10);
    const c0 = elapsed(g.mission);
    stepGame(g, I({ pausePressed: true }), DT);
    run(g, IDLE, 60);
    expect(elapsed(g.mission)).toBe(c0);
    stepGame(g, I({ pausePressed: true }), DT);
    g.nina.body.x = 10 - NINA.w / 2;
    run(g, IDLE, 5);
    stepGame(g, I({ usePressed: true }), DT);
    expect(g.screen).not.toBeNull();
    const c1 = elapsed(g.mission);
    run(g, IDLE, 60);
    expect(g.screen).not.toBeNull();
    expect(elapsed(g.mission)).toBeCloseTo(c1 + 1, 6);
  });
});

describe('«заново» сохраняет миссию', () => {
  it('провал в миссии 2 без сцены приезда: снова миссия 2 — цель bomb, 12 минут, тот же старт', () => {
    const g = createGame(loadRoomsFs('rooms2'), MISSIONS[2].start, 2);
    g.mission.timeLeft = DT / 2;
    stepGame(g, IDLE, DT);
    expect(g.mission.result).toBe('failed');
    run(g, IDLE, Math.ceil(MISSION.restartDelay / DT) + 1);
    stepGame(g, I({ jump: true, jumpPressed: true }), DT);
    expect(g.mission.result).toBeNull();
    expect(g.missionId).toBe(2);
    expect(g.mission.goal).toBe('bomb');
    expect(g.mission.timeLeft).toBe(12 * 60);
    expect(g.roomId).toBe('gate');
  });
});

describe('HUD миссии 2', () => {
  type T = { x: number; s: string };
  const hud = (g: Game, l: Lang) => {
    setLang(l);
    const out: T[] = [];
    drawGame({ push: () => {}, text: (x: number, y: number, s: string) => { if (y === 0) out.push({ x, s }); } } as never, g, 1);
    setLang('ru');
    return out;
  };
  const bunker = () => {
    const g = createGame(loadRoomsFs('rooms2'), MISSIONS[2].start, 2);
    run(g, IDLE, 5);
    return g;
  };

  it('до закладки — «БОМБА —», с бомбой в руках — «БОМБА ЕСТЬ», затем таймер; лент нет', () => {
    const g = bunker();
    expect(hud(g, 'ru').map(t => t.s)).toEqual(expect.arrayContaining(['БОМБА — · ', '12:00']));
    g.nina.held = 'bomb';
    expect(hud(g, 'ru').map(t => t.s)).toContain('БОМБА ЕСТЬ · ');
    expect(hud(g, 'en').map(t => t.s)).toContain('BOMB HELD · ');
    expect(hud(g, 'ru').some(t => t.s.startsWith('ЛЕНТЫ'))).toBe(false);
  });

  it('после закладки — только «ВЗРЫВ m:ss»', () => {
    const g = bunker();
    plantBomb(g.mission);
    const s = hud(g, 'ru').map(t => t.s);
    expect(s).toContain('ВЗРЫВ 1:30');
    expect(s.some(t => t.startsWith('БОМБА'))).toBe(false);
  });

  it('ширина: бомба и таймер не залезают на шкалу энергии и подпись справа — RU/EN, и в реплее; клетки под ними вычищены', () => {
    for (const l of ['ru', 'en'] as const) {
      for (const held of [false, true]) {
        for (const replay of [false, true]) {
          const g = bunker();
          g.nina.held = held ? 'bomb' : null;
          g.replay = replay;
          const t = hud(g, l);
          const obj = t.find(x => x.s === STR[l].hudBomb(held))!;
          const label = replay ? STR[l].replayHud : g.roomId;
          const right = t.find(x => x.s === label)!;
          const w = hudWidth(STR[l].hudBomb(held) + '12:00');
          expect(obj.x, `${l} ${held} ${replay}`).toBeGreaterThanOrEqual(1 + hudWidth(STR[l].energy) + hudWidth('█'.repeat(10)));
          expect(obj.x + w, `${l} ${held} ${replay}`).toBeLessThanOrEqual(right.x);
          if (!replay) for (let x = Math.round(obj.x); x <= Math.round(obj.x + w - 0.6); x++) expect(hudCell(x, 0, label, 1), `${l} ${x}`).toBe(true);
        }
      }
    }
    expect(hudWidth(STR.ru.hudBomb(true) + '12:00')).toBeLessThan(ROOM_W / 3);
  });
});
