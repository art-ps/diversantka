import { GEN } from '../config';
import type { Dir } from '../world/room';
import { shuffle, type Rng } from './rng';

// Граф уровня на сетке комнат: комната 0 — старт (верхний ряд), рёбра — выходы между соседними клетками.
export interface Cell { x: number; y: number }
// Дверь n между room (дальше от старта) и other (ближе к старту): side — сторона room, с которой примыкает other.
// Тайлы двери стоят в other, у её края, обращённого к room: героиня подходит к двери изнутри своей комнаты.
// Ключ не кладётся в other любой двери и стоит минимум в двух переходах от other своей двери.
export interface DoorEdge { n: 1 | 2 | 3; room: number; other: number; side: 'left' | 'right' }
export interface Graph { cells: Cell[]; adj: number[][]; dist: number[]; goal: number; doors: DoorEdge[]; keys: number[] }
// rooms — комнат; loops — лишних рёбер сверх дерева не больше (петля, ломающая двери или ключи, пропускается); doors — дверей; goalHops — цель не дальше (Infinity — без предела).
export interface GraphOpts { rooms: number; loops: number; doors: number; goalHops: number }

const DELTA: Record<Dir, Cell> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };
const ORDER: Dir[] = ['left', 'right', 'up', 'down'];

export const dirTo = (a: Cell, b: Cell): Dir => (b.x < a.x ? 'left' : b.x > a.x ? 'right' : b.y < a.y ? 'up' : 'down');

// Переходов от from до каждой комнаты; −1 — недостижима. blocked(a, b) — ребро закрыто.
export function bfs(adj: number[][], from: number, blocked: (a: number, b: number) => boolean = () => false): number[] {
  const d = adj.map(() => -1);
  d[from] = 0;
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    for (const b of adj[a]) {
      if (d[b] < 0 && !blocked(a, b)) {
        d[b] = d[a] + 1;
        q.push(b);
      }
    }
  }
  return d;
}

// Граф или null, если не сложился (не хватило рёбер пути под двери или комнат под ключи) — тогда следующая попытка.
// Порядок: дерево → цель, путь, двери и ключи на дереве → петли, не ломающие дверей и ключей → dist по итоговому графу.
export function buildGraph(rng: Rng, o: GraphOpts): Graph | null {
  const W = Math.ceil(Math.sqrt(o.rooms * 1.5)), H = Math.ceil(o.rooms / W) + 1;
  const cells: Cell[] = [{ x: Math.floor(rng() * W), y: 0 }];
  const at = new Map<string, number>([[`${cells[0].x},0`, 0]]);
  const adj: number[][] = [[]];
  const link = (a: number, b: number) => {
    adj[a].push(b);
    adj[b].push(a);
  };

  // Дерево растёт от комнаты из списка: с вероятностью GEN.growNewest — от последней добавленной, иначе от случайной,
  // поэтому ветки появляются по всей длине пути, а не только в конце. Сосед — случайный; вбок вес 3, вверх-вниз 1.
  // У старта — только вправо и вниз. Комната без свободных соседей выбывает из списка.
  const stack = [0];
  while (cells.length < o.rooms && stack.length) {
    const si = rng() < GEN.growNewest ? stack.length - 1 : Math.floor(rng() * stack.length);
    const cur = stack[si], c = cells[cur];
    const free = ORDER
      .filter(d => !(cur === 0 && (d === 'left' || d === 'up')))
      .map(d => ({ d, x: c.x + DELTA[d].x, y: c.y + DELTA[d].y }))
      .filter(p => p.x >= 0 && p.x < W && p.y >= 0 && p.y < H && !at.has(`${p.x},${p.y}`));
    if (!free.length) {
      stack.splice(si, 1);
      continue;
    }
    const w = free.map(p => (p.d === 'left' || p.d === 'right' ? 3 : 1));
    let r = rng() * w.reduce((s, x) => s + x, 0), i = 0;
    while (i < free.length - 1 && r >= w[i]) r -= w[i++];
    const id = cells.length;
    cells.push({ x: free[i].x, y: free[i].y });
    at.set(`${free[i].x},${free[i].y}`, id);
    adj.push([]);
    link(cur, id);
    stack.push(id);
  }
  if (cells.length < o.rooms) return null;

  // Цель — по дереву: самая дальняя от старта комната не дальше goalHops.
  let dist = bfs(adj, 0);
  let goal = -1;
  dist.forEach((d, i) => {
    if (i && d <= o.goalHops && (goal < 0 || d > dist[goal])) goal = i;
  });
  if (goal < 0) return null;

  // Кратчайший путь старт → цель: от цели к соседу на переход ближе (в дереве он единственный).
  const path = [goal];
  while (path[path.length - 1] !== 0) {
    const a = path[path.length - 1];
    path.push(Math.min(...adj[a].filter(b => dist[b] === dist[a] - 1)));
  }
  path.reverse();
  const onPath = new Set(path);

  // Кандидаты в двери — горизонтальные рёбра пути: в дереве каждое ребро пути — мост к цели.
  const bridges: [number, number][] = [];
  for (let i = 0; i + 1 < path.length; i++) if (cells[path[i]].y === cells[path[i + 1]].y) bridges.push([path[i], path[i + 1]]);
  if (bridges.length < o.doors) return null;
  const doorEdge = (d: DoorEdge, x: number, y: number) => (d.room === x && d.other === y) || (d.room === y && d.other === x);

  // Наборы дверей: возрастающие номера рёбер, ближе к равномерной расстановке — раньше (при равенстве — лексикографически).
  const even = Array.from({ length: o.doors }, (_, k) => Math.floor(((k + 1) * bridges.length) / (o.doors + 1)));
  const combos: number[][] = [];
  const grow = (from: number, acc: number[]) => {
    if (acc.length === o.doors) {
      combos.push(acc);
      return;
    }
    for (let i = from; i < bridges.length; i++) grow(i + 1, [...acc, i]);
  };
  grow(0, []);
  const cost = (c: number[]) => c.reduce((s, i, k) => s + Math.abs(i - even[k]), 0);
  combos.sort((a, b) => cost(a) - cost(b) || a.reduce((r, x, k) => r || x - b[k], 0));

  // Ключ k — в комнате, достижимой без дверей ≥ k; не старт, не цель, не комната с тайлами любой двери,
  // минимум в двух переходах от комнаты с тайлами двери k. Сначала тупики вне пути, потом любые тупики,
  // потом все кандидаты; из них — ближайший к комнате с тайлами двери k (при равенстве — дальше от старта,
  // затем с меньшим номером). Первый набор дверей, под который легли все ключи, — наш.
  const placeKeys = (doors: DoorEdge[]): number[] | null => {
    const keys: number[] = [];
    for (let k = 1; k <= o.doors; k++) {
      const closed = doors.filter(d => d.n >= k);
      const reach = bfs(adj, 0, (x, y) => closed.some(d => doorEdge(d, x, y)));
      const near = bfs(adj, doors[k - 1].other);
      const cand = cells.map((_, i) => i).filter(i =>
        i !== 0 && i !== goal && reach[i] >= 0 && near[i] >= 2 && !keys.includes(i) && !doors.some(d => d.other === i));
      if (!cand.length) return null;
      const leaves = cand.filter(i => adj[i].length === 1);
      const off = leaves.filter(i => !onPath.has(i));
      const pool = off.length ? off : leaves.length ? leaves : cand;
      keys.push(pool.reduce((best, i) => (near[i] < near[best] || (near[i] === near[best] && dist[i] > dist[best]) ? i : best)));
    }
    return keys;
  };
  let doors: DoorEdge[] = [], keys: number[] | null = null;
  for (const c of combos) {
    doors = c.map((i, k) => {
      const [a, b] = bridges[i];
      return { n: (k + 1) as 1 | 2 | 3, room: b, other: a, side: cells[a].x < cells[b].x ? 'left' : 'right' };
    });
    keys = placeKeys(doors);
    if (keys) break;
  }
  if (!keys) return null;

  // Петли — после дверей и ключей: рёбра между соседями, уже стоящими на сетке, кроме старта и комнат ключей
  // (тупик с ключом не становится проходным). Петля остаётся, только если с ней каждая дверь — по-прежнему мост
  // к цели, каждый ключ — минимум в двух переходах от комнаты с тайлами своей двери, а цель — самая дальняя
  // в пределах goalHops. Не прошедшая петля пропускается: петель может выйти меньше o.loops.
  const extra: [number, number][] = [];
  cells.forEach((c, a) => {
    for (const d of ['right', 'down'] as Dir[]) {
      const b = at.get(`${c.x + DELTA[d].x},${c.y + DELTA[d].y}`);
      if (b !== undefined && a !== 0 && b !== 0 && !adj[a].includes(b)) extra.push([a, b]);
    }
  });
  let loops = 0;
  for (const [a, b] of shuffle(rng, extra)) {
    if (loops >= o.loops) break;
    if (keys.includes(a) || keys.includes(b)) continue;
    link(a, b);
    const d = bfs(adj, 0);
    const ok = Math.max(...d.filter(x => x <= o.goalHops)) === d[goal]
      && doors.every(d => bfs(adj, 0, (x, y) => doorEdge(d, x, y))[goal] < 0)
      && keys.every((r, k) => bfs(adj, doors[k].other)[r] >= 2);
    if (ok) loops++;
    else {
      adj[a].pop();
      adj[b].pop();
    }
  }

  dist = bfs(adj, 0);
  return { cells, adj, dist, goal, doors, keys };
}
