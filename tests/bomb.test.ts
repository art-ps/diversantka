import { afterEach, describe, expect, it } from 'vitest';
import { BOMB, DT, MISSION, NINA } from '../src/config';
import { createGame, stepGame, type Game } from '../src/game';
import { LANGS, setLang, STR } from '../src/i18n';
import { IDLE, type Intent } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { PAL } from '../src/render/palette';
import { drawGame, hudWidth } from '../src/render/scene';
import { createMission, formatFuse, fuseTick, plantBomb, startBike, tickTimer } from '../src/sim/mission';
import type { Room } from '../src/world/room';
import { parseItems } from '../src/world/spawns';
import { FLOOR, roomOf } from './helpers';

afterEach(() => setLang('ru'));

const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const press = (g: Game, p: Partial<Intent>) => stepGame(g, I(p), DT);
const hold = (g: Game, p: Partial<Intent>, s: number) => { for (let i = 0; i < Math.round(s / DT); i++) stepGame(g, I(p), DT); };
const standAt = (g: Game, x: number) => {
  Object.assign(g.nina.body, { x: x - NINA.w / 2, y: 22 - NINA.h, vx: 0, vy: 0 });
  hold(g, {}, 0.1);
};
const R = (id: string, meta: Record<string, string>): Room => ({ ...roomOf({ 22: FLOOR }), id, meta });
// Реакторная: бомба на полу у x = 6, точка закладки у x = 20, мотоцикл у x = 34, терминал у x = 2.
const world = () => new Map([['a', R('a', { items: 'bomb@6,22', bomb: '20,22', bike: '34,22', terminals: '2,22' })]]);
const game = () => {
  const g = createGame(world(), { room: 'a', x: 10, bottom: 22 });
  g.mission.goal = 'bomb'; // миссия с бомбой — включит план 5в.3
  hold(g, {}, 0.1);
  return g;
};
const takeBomb = (g: Game) => {
  standAt(g, 6);
  press(g, { throwPressed: true });
};
const plantIt = (g: Game) => {
  takeBomb(g);
  standAt(g, 20);
  press(g, { usePressed: true });
};
const texts = (g: Game) => {
  const out: { s: string; c: readonly number[] }[] = [];
  drawGame({ push: () => {}, text: (_x: number, _y: number, s: string, c: readonly number[]) => { out.push({ s, c }); } } as never, g, 1);
  return out;
};

describe('взрывчатка: предмет', () => {
  it('bomb — предмет; бросить нельзя: K с бомбой ничего не делает', () => {
    expect(parseItems('bomb@6,22', 'a')).toEqual([{ kind: 'bomb', x: 6, bottom: 22 }]);
    const g = game();
    takeBomb(g);
    expect(g.nina.held).toBe('bomb');
    press(g, { throwPressed: true });
    press(g, { throwPressed: true, up: true });
    expect(g.nina.held).toBe('bomb');
    expect(g.projectiles).toEqual([]);
  });

  it('рисуется «@» красным', () => {
    const g = game();
    const out: { ch: string; c: readonly number[] }[] = [];
    drawGame({ push: (_x: number, _y: number, ch: string, c: readonly number[]) => { out.push({ ch, c }); }, text: () => {} } as never, g, 1);
    expect(out.filter(p => p.ch === '@' && p.c === PAL.danger)).toHaveLength(1);
  });
});

describe('взрывчатка: закладка', () => {
  it('без бомбы E у точки — «НУЖНА ВЗРЫВЧАТКА» над героиней, отсчёта нет', () => {
    const g = game();
    standAt(g, 20);
    press(g, { usePressed: true });
    expect(g.mission.fuse).toBeNull();
    const f = g.floaters.find(f => f.text === STR.ru.needBomb)!;
    expect(f.x).toBeCloseTo(20, 0);
    expect(f.y).toBeLessThan(g.nina.body.y);
  });

  it('с бомбой E у точки — отсчёт 90 с, бомба потрачена, жар у точки, в HUD «ВЗРЫВ 1:30» красным', () => {
    const g = game();
    plantIt(g);
    expect(g.mission.fuse).toBeCloseTo(BOMB.fuse);
    expect(g.nina.held).toBeNull();
    expect(g.fires.some(f => f.kind === 'bomb')).toBe(true);
    const hud = texts(g).find(t => t.s.startsWith('ВЗРЫВ'))!;
    expect(hud.s).toBe('ВЗРЫВ 1:30');
    expect(hud.c).toBe(PAL.danger);
    expect(texts(g).some(t => t.s.startsWith('ЛЕНТЫ'))).toBe(false);
    hold(g, {}, 1.1);
    expect(texts(g).find(t => t.s.startsWith('ВЗРЫВ'))!.s).toBe('ВЗРЫВ 1:29');
  });

  it('жар у точки растёт с отсчётом', () => {
    const g = game();
    plantIt(g);
    const fire = g.fires.find(f => f.kind === 'bomb')!;
    hold(g, {}, 1);
    const early = fire.field.bed.filter(v => v > 0).length;
    g.mission.fuse = BOMB.fuse / 2;
    hold(g, {}, 0.1);
    expect(fire.field.bed.filter(v => v > 0).length).toBeGreaterThan(early);
  });

  it('гибель не откатывает закладку: отсчёт идёт, бомба не возвращается, жар на месте', () => {
    const g = game();
    plantIt(g);
    hold(g, {}, 2);
    g.nina.dead = true;
    g.nina.deadT = NINA.respawnDelay;
    press(g, { jumpPressed: true, jump: true });
    expect(g.nina.dead).toBe(false);
    expect(g.mission.fuse).toBeLessThan(BOMB.fuse - 2);
    expect(g.items.filter(i => i.kind === 'bomb')).toEqual([]);
    expect(g.fires.some(f => f.kind === 'bomb')).toBe(true);
  });

  it('гибель с бомбой в руках: после респауна бомба снова на полу, одна, ничего не потрачено', () => {
    const g = game();
    takeBomb(g);
    expect(g.nina.held).toBe('bomb');
    g.nina.dead = true;
    g.nina.deadT = NINA.respawnDelay;
    press(g, { jumpPressed: true, jump: true });
    expect(g.nina.dead).toBe(false);
    expect(g.items.filter(i => i.kind === 'bomb')).toHaveLength(1);
    expect(g.spent.size).toBe(0);
    expect(g.nina.held).toBeNull();
  });
});

describe('отсчёт', () => {
  it('тик раз в секунду, последние 10 с — дважды в секунду', () => {
    const g = game();
    plantIt(g);
    g.sfx = [];
    hold(g, {}, 3);
    expect(g.sfx.filter(s => s === 'fuse')).toHaveLength(3);
    g.mission.fuse = BOMB.fast - 0.1;
    g.sfx = [];
    hold(g, {}, 3);
    expect(g.sfx.filter(s => s === 'fuse')).toHaveLength(6);
    expect(fuseTick(10.01, 9.99)).toBe(true);
    expect(fuseTick(9.6, 9.4)).toBe(true);
    expect(fuseTick(30.6, 30.4)).toBe(false);
  });

  it('с бомбой таймер миссии идёт, но проигрыш решает отсчёт', () => {
    const m = createMission({ room: 'a', x: 0, bottom: 22 });
    plantBomb(m);
    m.timeLeft = 0.01;
    tickTimer(m, 1);
    expect(m.timeLeft).toBe(0);
    expect(m.result).toBeNull();
    tickTimer(m, BOMB.fuse);
    expect(m.result).toBe('failed');
    expect(m.blown).toBe(true);
  });

  it('ноль — взрыв: звук explode, огонь и помехи 1.5 с, затем «МИССИЯ ПРОВАЛЕНА»; заново — после паузы', () => {
    const g = game();
    plantIt(g);
    g.mission.fuse = 0.05;
    g.sfx = [];
    hold(g, {}, 0.1);
    expect(g.mission.result).toBe('failed');
    expect(g.sfx).toContain('explode');
    const fire: string[] = [];
    drawGame({ push: (_x: number, _y: number, ch: string) => { fire.push(ch); }, text: (_x: number, _y: number, s: string) => { fire.push(s); } } as never, g, 1);
    expect(fire).not.toContain(STR.ru.failed);
    hold(g, {}, BOMB.blast);
    expect(texts(g).map(t => t.s)).toContain(STR.ru.failed);
    press(g, { jumpPressed: true, jump: true });
    expect(g.mission.result).toBe('failed'); // ещё пауза restartDelay
    hold(g, {}, MISSION.restartDelay);
    press(g, { jumpPressed: true, jump: true });
    expect(g.mission.result).toBeNull();
  });
});

describe('выезд', () => {
  it('цель «бомба»: без закладки мотоцикл не едет — «ЗАЛОЖИ ВЗРЫВЧАТКУ»; заложена — миссия выполнена', () => {
    const g = game();
    standAt(g, 34);
    press(g, { usePressed: true });
    expect(g.mission.result).toBeNull();
    expect(g.floaters.map(f => f.text)).toContain(STR.ru.plantFirst);
    expect(g.sfx).not.toContain('zap');
    plantIt(g);
    standAt(g, 34);
    press(g, { usePressed: true });
    expect(g.mission.result).toBe('won');
  });

  it('цель «ленты» (миссия 1) — как было: нужен выключенный забор', () => {
    const m = createMission({ room: 'a', x: 0, bottom: 22 });
    plantBomb(m);
    expect(startBike(m)).toBe(false);
    m.fenceOff = true;
    expect(startBike(m)).toBe(true);
  });
});

describe('тексты', () => {
  it.each(LANGS)('%s: отсчёт «m:ss», подсказки — из атласа; отсчёт не шире лент с таймером', l => {
    setLang(l);
    expect(formatFuse(BOMB.fuse)).toBe('1:30');
    expect(formatFuse(9.2)).toBe('0:10');
    const s = STR[l];
    for (const t of [s.needBomb, s.plantFirst, s.hudFuse('1:30')]) for (const ch of t) expect(CHARSET, t).toContain(ch);
    expect(hudWidth(s.hudFuse('1:30'))).toBeLessThanOrEqual(hudWidth(s.hudTapes(6, 6) + '00:00'));
  });
});
