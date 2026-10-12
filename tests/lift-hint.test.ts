import { expect, it } from 'vitest';
import { DT, NINA } from '../src/config';
import { createGame, enterRoom, liftCall, liftHint, stepGame, type Game } from '../src/game';
import { IDLE, type Intent } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { STR } from '../src/i18n';
import { drawGame, drawLifts, liftPanels } from '../src/render/scene';
import { openScreen } from '../src/sim/terminal';
import { loadRoomsFs } from './helpers';

const LIFT_HINT = STR.ru.liftHint;

// Шахта лифта — колонки 26..28, этаж каждой комнаты шахты — строка 22. Враги не мешают.
const I = (p: Partial<Intent> = {}): Intent => ({ ...IDLE, ...p });
const run = (g: Game, p: Partial<Intent>, n: number, until: () => boolean = () => false) => {
  for (let i = 0; i < n && !until(); i++) stepGame(g, I(p), DT);
};
const at = (room: string, x: number, liftY = 22) => {
  const g = createGame(loadRoomsFs(), { room, x: x - NINA.w / 2, bottom: 22 });
  g.lifts[0].y = liftY;
  enterRoom(g, room);
  g.androids = [];
  g.dogs = [];
  run(g, {}, 5);
  return g;
};
// Все строки, выведенные drawGame через text (HUD, подсказки, экраны).
const texts = (g: Game) => {
  const out: string[] = [];
  drawGame({ push: () => {}, text: (_x: number, _y: number, s: string) => { out.push(s); } } as never, g, 1);
  return out;
};

it('панель вызова — у каждого этажа остановки: слева от шахты; в shaft-top — с обеих сторон', () => {
  const g = at('shaft-top', 10);
  const lift = g.lifts[0];
  const expected: Record<string, number[]> = { 'shaft-top': [25.5, 29.5], 'shaft-1': [25.5], 'shaft-2': [25.5], 'shaft-bot': [25.5] };
  for (const [id, xs] of Object.entries(expected)) {
    const room = g.rooms.get(id)!;
    expect(liftPanels(lift, room), id).toEqual(xs.map(x => ({ x, bottom: 22 })));
    const out: { x: number; y: number; ch: string; a: number }[] = [];
    drawLifts({ push: (x, y, ch, c, s = 1) => { if (ch === '█' && s === 0.5) out.push({ x: x + 0.5, y: y + 0.5, ch, a: c[3] }); } }, [lift], room, 0, 0, 0.3);
    expect(out.map(p => p.x), id).toEqual(xs);
    for (const p of out) {
      expect(p.y, id).toBeCloseTo(20);
      expect(p.a, id).toBeGreaterThan(0);
      expect(room.tiles[20][Math.floor(p.x)], id).not.toBe('#'); // на виду, не в стене
    }
  }
  expect(liftPanels(lift, g.rooms.get('yard')!)).toEqual([]); // шахта сюда не идёт
});

it('подсказка «E — ВЫЗВАТЬ ЛИФТ»: у шахты, пока лифта на этаже нет; после E (едет) и с лифтом на этаже — нет; вдали — нет', () => {
  for (const ch of LIFT_HINT) expect(CHARSET).toContain(ch);
  const g = at('shaft-bot', 25); // лифт наверху, в shaft-top
  expect(liftCall(g)).toMatchObject({ stop: 97 });
  expect(liftHint(g)).toBe(true);
  expect(texts(g)).toContain(LIFT_HINT);
  run(g, {}, 30);
  expect(texts(g).filter(s => s === LIFT_HINT)).toHaveLength(1); // ровная строка, не всплывающие числа
  expect(g.floaters).toHaveLength(0);
  stepGame(g, I({ usePressed: true }), DT);
  expect(g.lifts[0].target).toBe(97);
  expect(liftHint(g)).toBe(false); // уже едет сюда
  run(g, {}, 1500, () => g.lifts[0].target === null);
  expect(g.lifts[0].y).toBe(97);
  expect(liftHint(g)).toBe(false); // лифт на этаже
  expect(texts(g)).not.toContain(LIFT_HINT);
  const far = at('shaft-bot', 15);
  expect(liftHint(far)).toBe(false);
  const top = at('shaft-top', 30.3, 47); // справа от шахты в shaft-top, лифт ниже
  expect(liftHint(top)).toBe(true);
});

it('подсказки нет на паузе, на экране ЭВМ, в прыжке, после гибели и при переходе экрана', () => {
  const g = at('shaft-bot', 25);
  expect(liftHint(g)).toBe(true);
  g.paused = true;
  expect(liftHint(g)).toBe(false);
  expect(texts(g)).not.toContain(LIFT_HINT);
  g.paused = false;
  g.screen = openScreen({ x: 10, bottom: 22, controls: [], main: false });
  expect(liftHint(g)).toBe(false);
  expect(texts(g)).not.toContain(LIFT_HINT);
  g.screen = null;
  stepGame(g, I({ jump: true, jumpPressed: true }), DT);
  run(g, { jump: true }, 3);
  expect(g.nina.state).toBe('air');
  expect(liftHint(g)).toBe(false);
  run(g, {}, 120, () => g.nina.state === 'ground');
  expect(liftHint(g)).toBe(true);
  g.nina.dead = true;
  expect(liftHint(g)).toBe(false);
  g.nina.dead = false;
  g.transition = { from: 'shaft-2', dir: 'down', t: 0 };
  expect(liftHint(g)).toBe(false);
});
