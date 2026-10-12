import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { MISSION, ROOM_W } from '../src/config';
import { createGame, createPrologue, type Game } from '../src/game';
import { lang, LANGS, setLang, STR, str, type Strings } from '../src/i18n';
import { CHARSET } from '../src/render/atlas';
import { drawGame, hudWidth } from '../src/render/scene';
import { KEY_COLS, TITLE_BOX, WIDE, wrap } from '../src/render/screens';
import { openScreen } from '../src/sim/terminal';
import { loadRoomsFs } from './helpers';

afterEach(() => setLang('ru')); // язык — общий для модуля: тест, поставивший English, возвращает русский

// Самый длинный id комнаты — для строк ЭВМ с id (id не переводятся).
const ROOM = [...loadRoomsFs().keys()].reduce((a, b) => (b.length > a.length ? b : a));
const N = MISSION.tapes;

// Все тексты языка, которые видит игрок; функции — с самыми длинными аргументами.
const visible = (s: Strings): string[] => [
  s.energy, s.hudTapes(N, N) + '15:00', s.dead, s.credit, s.liftHint, ...Object.values(s.prologue),
  s.tapeFloat(N, N), s.sourceFound, s.fenceLive, s.killed, s.blocked,
  s.notEnoughTapes(N - 1, N), s.tapesIn, s.accessDenied, s.fenceOff,
  s.resultLine('15:00', `${N}/${N}`, 999, true), s.resultLine('15:00', `${N}/${N}`, 999, false),
  ...s.bootLog, s.menuFlamer(ROOM), s.menuTapes, s.menuExit, s.flamerOff(ROOM), s.screenHint,
  s.won, ...s.resultRows('15:00', `${N}/${N}`, 999, true), ...s.resultRows('15:00', `${N}/${N}`, 999, false),
  s.copyHint, s.copiedHint, s.failed, s.failedHint,
  s.mapTitle, s.mapLegend, s.mapHint, ...Object.values(s.mapIcons),
  s.titleName, s.titleTask, ...s.titleKeys.flat(), s.titleStart, s.titleFocus,
];

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(n => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith('.ts') ? [join(dir, n)] : []));
// Кириллица в коде вне словаря допустима только в сообщениях для разработчика: ошибки файлов комнат и клипов,
// метки parsePoints, ошибки запуска в main.ts. Атлас перечисляет буквы, а не тексты.
const DEV_FILES = ['i18n.ts', 'render/atlas.ts', 'anim/clip.ts', 'world/room.ts', 'world/spawns.ts', 'world/map.ts', 'world/index.ts', 'main.ts'];
const DEV_LINE = /parsePoints\(/;
const LITERAL = /(['"`])(?:(?!\1).)*[А-Яа-яЁё](?:(?!\1).)*\1/;

it('тексты игры — только в src/i18n.ts: вне словаря нет строк с кириллицей, кроме сообщений для разработчика', () => {
  const found: string[] = [];
  for (const f of files(SRC)) {
    const rel = relative(SRC, f).replaceAll('\\', '/');
    if (DEV_FILES.includes(rel)) continue;
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    code.split('\n').forEach((line, i) => {
      const bare = line.replace(/(^|\s)\/\/.*$/, '');
      if (LITERAL.test(bare) && !DEV_LINE.test(bare)) found.push(`${rel}:${i + 1}: ${bare.trim()}`);
    });
  }
  expect(found).toEqual([]);
});

it('язык по умолчанию — русский: тесты, которые язык не ставят, видят прежние тексты', () => {
  expect(lang()).toBe('ru');
  expect(str()).toBe(STR.ru);
});

it.each(LANGS)('%s: все тексты — из символов атласа', l => {
  for (const s of visible(STR[l])) for (const ch of s) expect(CHARSET, s).toContain(ch);
});

const CYR = /[А-Яа-яЁё]/;
const shape = (v: unknown): unknown =>
  typeof v === 'function' ? 'fn'
    : Array.isArray(v) ? v.map(shape)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]))
        : typeof v;

it('English и русский: одни и те же ключи, функции, длина лога и таблицы; кнопки геймпада и клавиши-буквы совпадают', () => {
  expect(shape(STR.en)).toEqual(shape(STR.ru));
  expect(STR.en.titleKeys.slice(2).map(r => r[2])).toEqual(STR.ru.titleKeys.slice(2).map(r => r[2]));
  expect(STR.en.titleKeys.slice(3).map(r => r[1])).toEqual(STR.ru.titleKeys.slice(3).map(r => r[1]));
  expect(STR.en.titleName).toBe('DIVERSANTKA');
  expect(STR.en.titleTask).toBe('6 TAPES · COMPUTER · FENCE · BIKE. 15 MIN');
});

it('English: ни одной русской буквы; id комнаты в строках ЭВМ — как есть', () => {
  for (const s of [...visible(STR.en), STR.en.noWebgl]) expect(s).not.toMatch(CYR);
  expect(STR.en.menuFlamer('lab-2')).toBe('DISABLE FLAMER lab-2');
  expect(STR.en.flamerOff('lab-2')).toBe('FLAMER lab-2 DISABLED');
});

it.each(LANGS)('%s: строки помещаются — HUD, надписи по центру, экран ЭВМ, итог, карта, таблица клавиш', l => {
  const s = STR[l];
  // строка 0: «ЭНЕРГИЯ» и шкала | ленты с таймером по центру | id комнаты справа — не налезают
  const mid = hudWidth(s.hudTapes(N, N) + '15:00');
  expect(1 + hudWidth(s.energy) + 10 * 0.6).toBeLessThan((ROOM_W - mid) / 2);
  expect((ROOM_W + mid) / 2).toBeLessThan(ROOM_W - 1 - hudWidth(ROOM));
  // по центру экрана, над героиней, внизу справа
  for (const t of [s.dead, s.liftHint, ...Object.values(s.prologue), s.failed, s.failedHint, s.mapTitle, s.mapLegend, s.mapHint, s.credit]) {
    expect(hudWidth(t), t).toBeLessThanOrEqual(ROOM_W - 2);
  }
  // экран ЭВМ и итог — внутри рамки
  const framed = [...s.bootLog, `> ${s.menuFlamer(ROOM)}`, `> ${s.menuTapes}`, `> ${s.menuExit}`, s.flamerOff(ROOM), s.notEnoughTapes(N - 1, N),
    s.tapesIn, s.screenHint, s.won, ...s.resultRows('15:00', `${N}/${N}`, 999, true), s.copyHint, s.copiedHint];
  for (const t of framed) expect(t.length, t).toBeLessThanOrEqual(WIDE);
  // строка итога: не больше 6 строк (13–18, подсказка — в 20), ни одна не шире рамки
  const line = wrap(s.resultLine('15:00', `${N}/${N}`, 999, true), WIDE);
  expect(line.length).toBeLessThanOrEqual(6);
  for (const t of line) expect(t.length, t).toBeLessThanOrEqual(WIDE);
  // таблица клавиш: колонки не слипаются (хотя бы одна пустая буква между ними)
  for (const row of s.titleKeys) for (let j = 0; j < 2; j++) expect(row[j].length, row[j]).toBeLessThan(KEY_COLS[j + 1] - KEY_COLS[j]);
});

type Shot = { texts: { x: number; y: number; s: string; step: number }[]; pushes: string[] };
const shot = (g: Game): Shot => {
  const out: Shot = { texts: [], pushes: [] };
  const b = {
    push: (_x: number, _y: number, ch: string) => { out.pushes.push(ch); },
    text: (x: number, y: number, s: string, _c: unknown, step = 1) => { out.texts.push({ x, y, s, step }); },
  };
  drawGame(b as never, g, 0.1);
  return out;
};

// Кадры всех экранов с текстом: стартовый, полёт, всплеск и мачта, игра с HUD, гибель, ЭВМ, пауза с картой, итог, провал.
const frames = (): Record<string, Game> => {
  const rooms = loadRoomsFs();
  const at = () => createGame(rooms, { room: 'evm-1', x: 4, bottom: 22 });
  const title = createPrologue(rooms, true);
  const fly = createPrologue(rooms);
  const splash = createPrologue(rooms);
  splash.prologue!.phase = 'splash';
  const crash = createPrologue(rooms);
  crash.prologue!.phase = 'crash';
  const hud = at();
  const dead = at();
  dead.nina.dead = true;
  const evm = at();
  evm.screen = { ...openScreen({ x: 20, bottom: 22, main: true, controls: ['lab-2'] }), t: MISSION.bootTime, msg: STR.en.notEnoughTapes(5, N) };
  const map = at();
  map.paused = true;
  map.seen = new Set(rooms.keys());
  const won = at();
  won.mission.result = 'won';
  won.endT = MISSION.outroTime + 1;
  const failed = at();
  failed.mission.result = 'failed';
  return { title, fly, splash, crash, hud, dead, evm, map, won, failed };
};

it('English: на экранах игры нет русских букв — стартовый, пролог, HUD, гибель, ЭВМ, пауза, итог, провал', () => {
  setLang('en');
  for (const [name, g] of Object.entries(frames())) {
    const s = shot(g);
    const chars = [...s.pushes, ...s.texts.flatMap(t => [...t.s])];
    expect(chars.filter(ch => CYR.test(ch)), name).toEqual([]);
  }
});

it('English: ЭВМ, карта, итог и стартовый экран показывают английские тексты; стартовый — внутри рамки', () => {
  setLang('en');
  const f = frames(), texts = (g: Game) => shot(g).texts.map(t => t.s);
  expect(texts(f.evm)).toEqual(expect.arrayContaining(['CHECKPOINT SAVED', '> DISABLE FLAMER lab-2', '  LOAD TAPES', '  EXIT', 'NOT ENOUGH TAPES 5/6', STR.en.screenHint]));
  expect(texts(f.map)).toEqual(expect.arrayContaining([STR.en.mapTitle, STR.en.mapLegend, STR.en.mapHint]));
  expect(texts(f.won)).toEqual(expect.arrayContaining(['MISSION COMPLETE', 'TAPES   0/6', 'SOURCE FOUND: NO', STR.en.copyHint]));
  expect(texts(f.hud)).toEqual(expect.arrayContaining(['ENERGY ', 'TAPES 0/6 · ', 'evm-1']));
  const own = shot(f.title).texts.filter(t => t.y > TITLE_BOX.y0 && t.y < TITLE_BOX.y1);
  expect(own.map(t => t.s)).toEqual(expect.arrayContaining(['DIVERSANTKA', STR.en.titleTask, 'SPACE — START', STR.en.titleFocus, 'STICK/D-PAD']));
  const B = TITLE_BOX;
  for (const t of own) [...t.s].forEach((_, i) => {
    const cx = t.x + i * t.step + 0.5;
    expect(cx > B.x0 + 1 && cx < B.x1, t.s).toBe(true);
  });
});
