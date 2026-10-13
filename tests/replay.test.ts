import { afterEach, describe, expect, it } from 'vitest';
import { DT, ROOM_W } from '../src/config';
import { createGame, createPrologue, stepGame, type Game } from '../src/game';
import { LANGS, setLang, STR } from '../src/i18n';
import { IDLE, type Intent } from '../src/input/intent';
import { drawGame, hudWidth } from '../src/render/scene';
import { encodeIntent, quitsReplay, replayStep, unpackRecord } from '../src/sim/record';
import { loadRoomsFs } from './helpers';

afterEach(() => setLang('ru'));
const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });

describe('выход из реплея', () => {
  it('прыжок, удар, бросок, E, движение — выход', () => {
    for (const p of [{ jumpPressed: true }, { attackPressed: true }, { throwPressed: true }, { usePressed: true }, { moveX: 1 }, { moveX: -0.4 }]) {
      expect(quitsReplay(I(p)), JSON.stringify(p)).toBe(true);
    }
  });

  it('покой, пауза, вверх/вниз и удержание прыжка — не выход', () => {
    for (const p of [{}, { pausePressed: true }, { up: true, upPressed: true }, { down: true, downPressed: true }, { jump: true }]) {
      expect(quitsReplay(I(p)), JSON.stringify(p)).toBe(false);
    }
  });
});

describe('шаг реплея', () => {
  it('идёт по записи; после итога — покой; запись кончилась без итога — null', () => {
    const r = { rec: [encodeIntent(I({ moveX: 1 })), encodeIntent(I({ jumpPressed: true, jump: true }))], i: 0 };
    expect(replayStep(r, false)).toEqual(I({ moveX: 1 }));
    expect(replayStep(r, false)).toEqual(I({ jumpPressed: true, jump: true }));
    expect(replayStep(r, false)).toBeNull();
    expect(replayStep(r, true)).toEqual(IDLE);
    expect(r.i).toBe(2);
  });

  it('pausePressed в реплее всегда false — мир никогда не встаёт на паузу', () => {
    const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 10, bottom: 22 });
    const r = { rec: Array.from({ length: 50 }, (_, i) => (i % 2 ? 2 ** 17 - 1 : 0)), i: 0 };
    for (let k = 0; k < 50; k++) {
      const it = replayStep(r, g.mission.result !== null)!;
      expect(it.pausePressed).toBe(false);
      stepGame(g, it, DT);
      expect(g.paused).toBe(false);
    }
  });

  it('мусор в ?r= — ошибка разбора, а не падение; игра с пролога идёт', async () => {
    for (const bad of ['%%%', 'AAAA', 'AQ', '']) await expect(unpackRecord(bad)).rejects.toThrow();
    const g = createPrologue(loadRoomsFs(), true);
    expect(() => stepGame(g, IDLE, DT)).not.toThrow();
  });
});

describe('HUD в реплее', () => {
  const hud = (g: Game) => {
    const texts: { x: number; y: number; s: string }[] = [], walls: { x: number; y: number }[] = [];
    const b = {
      push: (x: number, y: number, ch: string) => { if (ch !== ' ') walls.push({ x, y }); },
      text: (x: number, y: number, s: string) => { texts.push({ x, y, s }); },
    };
    drawGame(b as never, g, 10);
    return { texts, walls };
  };

  it.each(LANGS)('%s: подсказка вместо id комнаты, не налезает на таймер и край, стена под ней вычищена', l => {
    setLang(l);
    const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 10, bottom: 22 });
    g.replay = true;
    const { texts, walls } = hud(g);
    const label = texts.find(t => t.s === STR[l].replayHud)!;
    expect(label, 'подсказка реплея').toBeDefined();
    expect(label.y).toBe(0);
    expect(texts.map(t => t.s)).not.toContain('lab-1');
    const clock = texts.find(t => /^\d\d:\d\d$/.test(t.s))!;
    expect(clock.x + hudWidth(clock.s)).toBeLessThan(label.x);
    expect(label.x + hudWidth(label.s)).toBeLessThanOrEqual(ROOM_W - 1 + 1e-9);
    expect(walls.filter(w => w.y < 0.5 && w.x + 0.5 >= label.x && w.x + 0.5 <= label.x + hudWidth(label.s))).toEqual([]);
  });

  it('без реплея — id комнаты справа, как раньше', () => {
    const g = createGame(loadRoomsFs(), { room: 'lab-1', x: 10, bottom: 22 });
    const t = hud(g).texts.map(x => x.s);
    expect(t).toContain('lab-1');
    expect(t).not.toContain(STR.ru.replayHud);
  });
});
