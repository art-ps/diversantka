import { GEN, ROOM_W } from '../config';
import { validateCameras, validateGates } from '../world';
import { DIRS, parseRoom, type Dir, type Room } from '../world/room';
import { parseAmbient, parseCameras, parseEnemies, parseFence, parsePoints } from '../world/spawns';

// Шаблон комнаты сгенерированного уровня (src/gen/templates/*.txt): формат комнаты, шапка —
// fits: выходы, которые шаблон умеет (по стандарту проёмов); min: с какого уровня; tags: start | deadend;
// ambient: фон; slots: места, которые генератор может заполнить; у стартового — start, bike, fence.
export type PointSlot = { kind: 'item' | 'terminal' | 'site'; x: number; bottom: number };
export type EnemySlot = { kind: 'enemy'; x: number; bottom: number; patrol: [number, number] };
export type FlamerSlot = { kind: 'flamer'; x: number; y: number; dir: 1 | -1 };
export type CameraSlot = { kind: 'camera'; x: number; y: number; arc: [number, number]; period: number };
export type Slot = PointSlot | EnemySlot | FlamerSlot | CameraSlot;

export interface Template { id: string; fits: Set<Dir>; min: number; tags: Set<string>; slots: Slot[]; meta: Record<string, string>; tiles: string[] }

const words = (s: string | undefined) => (s ?? '').split(/\s+/).filter(Boolean);

// «enemy@x,низ patrol=a..b ; item@x,низ ; terminal@x,низ ; site@x,низ ; flamer@x,y dir=left|right ; camera@x,y arc=a..b period=p»
export function parseSlots(s: string | undefined, file: string): Slot[] {
  return (s ?? '').split(';').map(p => p.trim()).filter(Boolean).map((rec): Slot => {
    const m = /^(enemy|item|terminal|site|flamer|camera)@(.*)$/.exec(rec);
    if (!m) throw new Error(`${file}: непонятный слот «${rec}»`);
    const [, kind, rest] = m;
    if (kind === 'enemy') {
      const e = parseEnemies(`android@${rest}`, file)[0];
      if (e.kind !== 'android') throw new Error(`${file}: плохой слот врага «${rec}»`);
      return { kind, x: e.x, bottom: e.bottom, patrol: e.patrol };
    }
    if (kind === 'flamer') {
      const f = parseEnemies(`flamer@${rest}`, file)[0];
      if (f.kind !== 'flamer') throw new Error(`${file}: плохой слот огнемёта «${rec}»`);
      return { kind, x: f.x, y: f.y, dir: f.dir };
    }
    if (kind === 'camera') {
      const c = parseCameras(rest, file)[0];
      return { kind, x: c.x, y: c.y, arc: c.arc, period: c.period };
    }
    const [p] = parsePoints(rest, file, `слота ${kind}`);
    return { kind: kind as PointSlot['kind'], x: p.x, bottom: p.bottom };
  });
}

export function parseTemplate(text: string, file = 'template'): Template {
  const r = parseRoom(text, file);
  const fits = new Set<Dir>();
  for (const w of words(r.meta.fits)) {
    if (!DIRS.includes(w as Dir)) throw new Error(`${file}: плохой выход в fits «${w}»`);
    fits.add(w as Dir);
  }
  if (!fits.size) throw new Error(`${file}: пустой fits`);
  const min = r.meta.min === undefined ? GEN.first : Number(r.meta.min);
  if (!Number.isInteger(min) || min < GEN.first) throw new Error(`${file}: min должен быть целым не меньше ${GEN.first}`);
  return { id: r.id, fits, min, tags: new Set(words(r.meta.tags)), slots: parseSlots(r.meta.slots, file), meta: r.meta, tiles: r.tiles };
}

const SWAP: Record<Dir, Dir> = { left: 'right', right: 'left', up: 'up', down: 'down' };
const flipX = (x: number) => ROOM_W - x; // непрерывная координата (центр предмета, сопло, патруль)

function mirrorSlot(s: Slot): Slot {
  switch (s.kind) {
    case 'enemy': return { ...s, x: flipX(s.x), patrol: [flipX(s.patrol[1]), flipX(s.patrol[0])] };
    case 'flamer': return { ...s, x: flipX(s.x), dir: s.dir === 1 ? -1 : 1 };
    case 'camera': return { ...s, x: ROOM_W - 1 - s.x, arc: [-s.arc[1], -s.arc[0]] }; // камера — клетка
    default: return { ...s, x: flipX(s.x) };
  }
}

// Зеркало по горизонтали: left ↔ right, строки задом наперёд, слоты от правого края.
export const mirror = (t: Template): Template => ({
  ...t,
  id: `${t.id}~m`,
  fits: new Set([...t.fits].map(d => SWAP[d])),
  tiles: t.tiles.map(row => [...row].reverse().join('')),
  slots: t.slots.map(mirrorSlot),
});

const cells = (cols: number[], rows: number[]): [number, number][] => cols.flatMap(c => rows.map(r => [c, r] as [number, number]));

// Клетки проёма выхода [колонка, строка] (стандарт спеки) и перемычки над и под проёмом left/right.
export const OPENING: Record<Dir, [number, number][]> = {
  left: cells([0, 1, 2], [18, 19, 20, 21]),
  right: cells([37, 38, 39], [18, 19, 20, 21]),
  up: cells([29, 30, 31], [0]),
  down: cells([29, 30, 31], [22, 23, 24]),
};
const OPEN_TILE = (d: Dir, c: number): string => (d === 'up' || d === 'down') && c === 30 ? 'H' : '.';
const LINTEL: Record<Dir, [number, number][]> = {
  left: cells([0, 1, 2], [17, 22]),
  right: cells([37, 38, 39], [17, 22]),
  up: [],
  down: [],
};

// Дверь N на ребре left/right: тайлы N в этой колонке, строки проёма.
export const DOOR_COL = { left: 1, right: 38 } as const;
export const DOOR_ROWS = [18, 19, 20, 21];

// Выход, которого нет в графе: клетки проёма — стена.
export function seal(tiles: string[][], d: Dir): void {
  for (const [c, r] of OPENING[d]) tiles[r][c] = '#';
}

export const enemyText = (kind: 'android' | 'dog' | 'guard', s: EnemySlot): string => `${kind}@${s.x},${s.bottom} patrol=${s.patrol[0]}..${s.patrol[1]}`;
export const flamerText = (s: FlamerSlot): string => `flamer@${s.x},${s.y} dir=${s.dir < 0 ? 'left' : 'right'}`;
export const cameraText = (s: CameraSlot): string => `${s.x},${s.y} arc=${s.arc[0]}..${s.arc[1]} period=${s.period}`;

// Тело шириной в клетку над точкой x (центр) на полу bottom: под каждой его колонкой — «#» или «=», над — не стена.
function standsAt(t: Template, x: number, bottom: number): boolean {
  if (bottom < 1 || bottom >= t.tiles.length) return false;
  for (let c = Math.floor(x - 0.5); c <= Math.floor(x + 0.5 - 1e-6); c++) {
    const below = t.tiles[bottom]?.[c], at = t.tiles[bottom - 1]?.[c];
    if ((below !== '#' && below !== '=') || at === undefined || at === '#') return false;
  }
  return true;
}

// Стандарт проёмов, слоты, обязательные слоты и шапка стартового; камеры и решётки — валидаторами мира.
export function checkTemplate(t: Template): string[] {
  const e: string[] = [];
  const start = t.tags.has('start');
  for (const d of DIRS) {
    if (t.fits.has(d)) {
      for (const [c, r] of OPENING[d]) if (t.tiles[r][c] !== OPEN_TILE(d, c)) e.push(`${t.id}: проём ${d} — клетка ${c},${r} должна быть «${OPEN_TILE(d, c)}»`);
      for (const [c, r] of LINTEL[d]) if (t.tiles[r][c] !== '#') e.push(`${t.id}: проём ${d} — клетка ${c},${r} должна быть «#»`);
    } else if (!(start && d === 'up')) {
      for (const [c, r] of OPENING[d]) if (t.tiles[r][c] !== '#') e.push(`${t.id}: выхода ${d} нет, а клетка проёма ${c},${r} не «#»`);
    }
  }
  if (t.tiles.some(row => /[123]/.test(row))) e.push(`${t.id}: двери ставит генератор — в шаблоне тайлов 1–3 быть не должно`);
  for (const s of t.slots) {
    if ((s.kind === 'item' || s.kind === 'terminal' || s.kind === 'site' || s.kind === 'enemy') && !standsAt(t, s.x, s.bottom)) {
      e.push(`${t.id}: слот ${s.kind} ${s.x},${s.bottom} не стоит на полу`);
    }
  }
  try {
    if (!parseAmbient(t.meta.ambient, t.id)) e.push(`${t.id}: нет фона «ambient:»`);
  } catch (err) {
    e.push((err as Error).message);
  }
  if (start) {
    if ([...t.fits].sort().join(' ') !== 'down right') e.push(`${t.id}: у стартового fits должен быть ровно «right down»`);
    for (const key of ['start', 'bike', 'fence']) if (!t.meta[key]) e.push(`${t.id}: у стартового нет «${key}:»`);
    try {
      parsePoints(t.meta.start, t.id, 'старта');
      parsePoints(t.meta.bike, t.id, 'мотоцикла');
      parseFence(t.meta.fence, t.id);
    } catch (err) {
      e.push((err as Error).message);
    }
  } else {
    if (!t.slots.some(s => s.kind === 'item')) e.push(`${t.id}: нужен хотя бы один слот item`);
    if (!t.slots.some(s => s.kind === 'enemy')) e.push(`${t.id}: нужен хотя бы один слот enemy`);
  }
  // Камеры и решётки: каждый слот заполнен (враги — андроидами) — так их видят валидаторы мира.
  const room: Room = {
    id: t.id, exits: {}, tiles: t.tiles,
    meta: {
      cameras: t.slots.flatMap(s => (s.kind === 'camera' ? [cameraText(s)] : [])).join(' ; '),
      enemies: t.slots.flatMap(s => (s.kind === 'enemy' ? [enemyText('android', s)] : [])).join(' ; '),
    },
  };
  const one = new Map([[t.id, room]]);
  e.push(...validateCameras(one), ...validateGates(one));
  return e;
}

const FILES = import.meta.glob('./templates/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
let cache: Template[] | null = null;

// Библиотека: шаблоны по пути файла, за каждым не-стартовым — его зеркало. Один раз за сессию; ошибка — исключение.
export function loadTemplates(): Template[] {
  if (cache) return cache;
  const out: Template[] = [];
  const ids = new Set<string>();
  for (const [path, text] of Object.entries(FILES).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const t = parseTemplate(text, path);
    if (ids.has(t.id)) throw new Error(`${path}: повтор id шаблона ${t.id}`);
    ids.add(t.id);
    const all = t.tags.has('start') ? [t] : [t, mirror(t)];
    const errors = all.flatMap(checkTemplate);
    if (errors.length) throw new Error(errors.join('\n'));
    out.push(...all);
  }
  return (cache = out);
}
