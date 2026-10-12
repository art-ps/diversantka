import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { MISSION } from '../src/config';
import { lang, LANGS, STR, str, type Strings } from '../src/i18n';
import { CHARSET } from '../src/render/atlas';
import { loadRoomsFs } from './helpers';

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
