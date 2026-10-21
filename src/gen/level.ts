import { GEN } from '../config';
import type { Spot } from '../sim/mission';
import { validateRooms } from '../world';
import type { Dir, Room } from '../world/room';
import { parsePoints } from '../world/spawns';
import {
  cameraChance, densityOf, doorCount, flamerChance, goalOf, guardWeight, loopsOf, maxGoalHops, roomsOf, tapesOf, timerOf, type Goal,
} from './difficulty';
import { bfs, buildGraph, dirTo } from './graph';
import { mulberry32, pick, seedOf, shuffle, type Rng } from './rng';
import { cameraText, DOOR_COL, DOOR_ROWS, enemyText, flamerText, loadTemplates, seal, type EnemySlot, type PointSlot, type Slot, type Template } from './templates';

// Сгенерированный уровень n ≥ GEN.first: комнаты и описание — старт (x — левый край тела), таймер, цель, лент на карте.
export interface LevelDef { start: Spot; time: number; goal: Goal; tapes: number }
export interface Level { rooms: Map<string, Room>; def: LevelDef; attempt: number }

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const slotCount = (t: Template, kind: Slot['kind']) => t.slots.filter(s => s.kind === kind).length;
const point = (s: PointSlot) => `${s.x},${s.bottom}`;

// Уровень n: попытки 0, 1, … по seedOf(n, attempt), пока граф и шаблоны не сложатся. Ошибка проверок мира на
// собранном уровне — исключение (баг генератора или шаблона), а не новая попытка.
export function generateLevel(n: number, templates: Template[] = loadTemplates()): Level {
  for (let attempt = 0; attempt < GEN.attempts; attempt++) {
    const lv = tryLevel(n, mulberry32(seedOf(n, attempt)), templates);
    if (!lv) continue;
    const errors = validateRooms(lv.rooms, lv.def.goal, lv.def.start.room, { tapes: lv.def.tapes, sources: 0 });
    if (errors.length) throw new Error(`уровень ${n}, попытка ${attempt}:\n${errors.join('\n')}`);
    return { ...lv, attempt };
  }
  throw new Error(`уровень ${n}: не собрался за ${GEN.attempts} попыток`);
}

function tryLevel(n: number, rng: Rng, all: Template[]): Omit<Level, 'attempt'> | null {
  const goal = goalOf(n);
  const g = buildGraph(rng, { rooms: roomsOf(n), loops: loopsOf(n), doors: doorCount(n), goalHops: goal === 'bomb' ? maxGoalHops : Infinity });
  if (!g) return null;
  const N = g.cells.length;
  const exits = g.cells.map((c, i) => new Set(g.adj[i].map(j => dirTo(c, g.cells[j]))));
  const leaf = (i: number) => g.adj[i].length === 1;

  // Роли: ключи — из графа; цель — точка закладки или главная ЭВМ; бомба или ленты и щиток. need — слотов под роли.
  const need = range(N).map(() => ({ item: 0, site: 0 }));
  for (const k of g.keys) need[k].item++;
  need[g.goal].site++;
  const free = range(N).filter(i => i !== 0 && i !== g.goal && !g.keys.includes(i));
  let bomb = -1, sw = -1;
  let tapes: number[] = [];
  if (goal === 'bomb') {
    if (!free.length) return null;
    const half = g.dist[g.goal] / 2;
    // В тупике примерно на середине пути: тупики (лист графа) в приоритете, нет их — любая свободная комната.
    const dead = free.filter(leaf);
    const pool = dead.length ? dead : free;
    bomb = pool.reduce((b, i) => (Math.abs(g.dist[i] - half) < Math.abs(g.dist[b] - half) ? i : b));
    need[bomb].item++;
  } else {
    const want = tapesOf(n);
    tapes = [...free].sort((a, b) => Number(leaf(b)) - Number(leaf(a)) || g.dist[b] - g.dist[a] || a - b).slice(0, want);
    if (tapes.length < want) return null;
    for (const t of tapes) need[t].item++;
    const fromGoal = bfs(g.adj, g.goal);
    const cand = range(N).filter(i => i !== 0 && fromGoal[i] >= 2);
    if (!cand.length) return null;
    sw = pick(rng, cand);
    need[sw].site++;
  }

  // Шаблон: выходы ⊆ fits, min ≤ n, слотов хватает; из подходящих — с наименьшим fits.
  const chosen: Template[] = [];
  for (let i = 0; i < N; i++) {
    const ok = all.filter(t => t.tags.has('start') === (i === 0) && t.min <= n && [...exits[i]].every(d => t.fits.has(d))
      && slotCount(t, 'item') >= need[i].item && slotCount(t, 'site') >= need[i].site);
    if (!ok.length) return null;
    const least = Math.min(...ok.map(t => t.fits.size));
    chosen.push(pick(rng, ok.filter(t => t.fits.size === least)));
  }

  // id комнаты — имя шаблона с номером: hall-1, hall-2 (у зеркала — то же имя).
  const used = new Map<string, number>();
  const ids = chosen.map(t => {
    const base = t.id.replace(/~m$/, '');
    const k = (used.get(base) ?? 0) + 1;
    used.set(base, k);
    return `${base}-${k}`;
  });

  // Свободные слоты комнат по видам, в случайном порядке; каждая роль забирает свой.
  const slots = chosen.map(t => ({
    item: shuffle(rng, t.slots.filter((s): s is PointSlot => s.kind === 'item')),
    site: shuffle(rng, t.slots.filter((s): s is PointSlot => s.kind === 'site')),
    terminal: shuffle(rng, t.slots.filter((s): s is PointSlot => s.kind === 'terminal')),
    enemy: shuffle(rng, t.slots.filter((s): s is EnemySlot => s.kind === 'enemy')),
  }));
  const meta = range(N).map(() => ({}) as Record<string, string[]>);
  const add = (i: number, key: string, v: string) => (meta[i][key] ??= []).push(v);

  g.keys.forEach((r, k) => add(r, 'items', `key${k + 1}@${point(slots[r].item.shift()!)}`));
  if (goal === 'bomb') {
    add(bomb, 'items', `bomb@${point(slots[bomb].item.shift()!)}`);
    add(g.goal, 'bomb', point(slots[g.goal].site.shift()!));
  } else {
    for (const t of tapes) add(t, 'tapes', point(slots[t].item.shift()!));
    add(g.goal, 'terminals', `${point(slots[g.goal].site.shift()!)} main`);
    add(sw, 'switch', point(slots[sw].site.shift()!));
  }

  // Враги: floor(плотность) на комнату и ещё один с вероятностью дробной части, не больше слотов; огнемёты и камеры —
  // по вероятности уровня. Старт пуст.
  const d = densityOf(n);
  const kinds = [{ k: 'android' as const, w: 3 }, { k: 'dog' as const, w: 2 }, { k: 'guard' as const, w: guardWeight(n) }];
  const total = kinds.reduce((s, x) => s + x.w, 0);
  const kindOf = () => {
    let r = rng() * total;
    for (const x of kinds) {
      if (r < x.w) return x.k;
      r -= x.w;
    }
    return 'android' as const;
  };
  let enemies = 0;
  const hazard: number[] = [];
  for (let i = 1; i < N; i++) {
    const want = Math.floor(d) + (rng() < d - Math.floor(d) ? 1 : 0);
    for (const s of slots[i].enemy.slice(0, want)) {
      add(i, 'enemies', enemyText(kindOf(), s));
      enemies++;
    }
    let danger = false;
    for (const s of chosen[i].slots) {
      if (s.kind === 'flamer' && rng() < flamerChance(n)) {
        add(i, 'enemies', flamerText(s));
        danger = true;
      }
      if (s.kind === 'camera' && rng() < cameraChance(n)) {
        add(i, 'cameras', cameraText(s));
        danger = true;
      }
    }
    if (danger) hazard.push(i);
  }

  // Терминалы: опасные комнаты по удалению от старта группами по 3; терминал — ближе к старту, чем группа.
  hazard.sort((a, b) => g.dist[a] - g.dist[b] || a - b);
  for (let c = 0; c < hazard.length; c += 3) {
    const group = hazard.slice(c, c + 3), dmin = g.dist[group[0]];
    const cand = range(N).filter(i => slots[i].terminal.length > 0 && g.dist[i] < dmin);
    if (!cand.length) continue;
    const near = cand.filter(i => g.dist[i] >= dmin - 2);
    const pool = near.length ? near : cand;
    const t = pool.reduce((b, i) => (g.dist[i] > g.dist[b] ? i : b));
    add(t, 'terminals', `${point(slots[t].terminal.shift()!)} controls=${group.map(i => ids[i]).join(',')}`);
  }

  // Комнаты: сетка шаблона с заделанными лишними выходами и дверями, выходы по графу, шапка.
  const rooms = new Map<string, Room>();
  for (let i = 0; i < N; i++) {
    const t = chosen[i];
    const tiles = t.tiles.map(row => [...row]);
    for (const dir of t.fits) if (!exits[i].has(dir)) seal(tiles, dir);
    // Дверь стоит в комнате со стороны старта (other) у края к цели: героиня подходит к ней вплотную внутри комнаты.
    for (const dr of g.doors) if (dr.other === i) for (const r of DOOR_ROWS) tiles[r][DOOR_COL[dr.side === 'left' ? 'right' : 'left']] = String(dr.n);
    const ex: Partial<Record<Dir, string>> = {};
    for (const j of g.adj[i]) ex[dirTo(g.cells[i], g.cells[j])] = ids[j];
    const m: Record<string, string> = { ambient: t.meta.ambient };
    for (const [k, v] of Object.entries(meta[i])) m[k] = v.join(' ; ');
    if (i === 0) {
      m.bike = t.meta.bike;
      if (goal === 'tapes') m.fence = t.meta.fence;
    }
    rooms.set(ids[i], { id: ids[i], exits: ex, meta: m, tiles: tiles.map(row => row.join('')) });
  }

  // Оценка маршрута в переходах: ключи и двери по порядку, затем цель и назад к мотоциклу.
  const [s] = parsePoints(chosen[0].meta.start, ids[0], 'старта');
  const stops = [0];
  g.doors.forEach((dr, k) => stops.push(g.keys[k], dr.room));
  if (goal === 'bomb') stops.push(bomb, g.goal, 0);
  else {
    const left = new Set(tapes);
    while (left.size) {
      const from = bfs(g.adj, stops[stops.length - 1]);
      const next = [...left].reduce((b, i) => (from[i] < from[b] ? i : b));
      stops.push(next);
      left.delete(next);
    }
    stops.push(g.goal, sw, 0);
  }
  let hops = 0;
  for (let i = 1; i < stops.length; i++) hops += bfs(g.adj, stops[i - 1])[stops[i]];

  return {
    rooms,
    def: { start: { room: ids[0], x: s.x, bottom: s.bottom }, time: timerOf(n, hops, enemies), goal, tapes: goal === 'tapes' ? tapes.length : 0 },
  };
}
