import type { Dir } from '../world/room';
import { shuffle, type Rng } from './rng';

// Граф уровня на сетке комнат: комната 0 — старт (верхний ряд), рёбра — выходы между соседними клетками.
export interface Cell { x: number; y: number }
// Дверь n между room (дальше от старта) и other (ближе к старту): side — сторона room, с которой примыкает other.
// Тайлы двери стоят в other, у её края, обращённого к room: героиня подходит к двери изнутри своей комнаты.
export interface DoorEdge { n: 1 | 2 | 3; room: number; other: number; side: 'left' | 'right' }
export interface Graph { cells: Cell[]; adj: number[][]; dist: number[]; goal: number; doors: DoorEdge[]; keys: number[] }
// rooms — комнат; loops — лишних рёбер сверх дерева; doors — дверей; goalHops — цель не дальше (Infinity — без предела).
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

// Граф или null, если не сложился (не хватило мостов под двери или комнат под ключи) — тогда следующая попытка.
export function buildGraph(rng: Rng, o: GraphOpts): Graph | null {
  const W = Math.ceil(Math.sqrt(o.rooms * 1.5)), H = Math.ceil(o.rooms / W) + 1;
  const cells: Cell[] = [{ x: Math.floor(rng() * W), y: 0 }];
  const at = new Map<string, number>([[`${cells[0].x},0`, 0]]);
  const adj: number[][] = [[]];
  const link = (a: number, b: number) => {
    adj[a].push(b);
    adj[b].push(a);
  };

  // Дерево: обход в глубину со случайным выбором соседа; вбок вес 3, вверх-вниз 1. У старта — только вправо и вниз.
  const stack = [0];
  while (cells.length < o.rooms && stack.length) {
    const cur = stack[stack.length - 1], c = cells[cur];
    const free = ORDER
      .filter(d => !(cur === 0 && (d === 'left' || d === 'up')))
      .map(d => ({ d, x: c.x + DELTA[d].x, y: c.y + DELTA[d].y }))
      .filter(p => p.x >= 0 && p.x < W && p.y >= 0 && p.y < H && !at.has(`${p.x},${p.y}`));
    if (!free.length) {
      stack.pop();
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

  // Петли: рёбра между соседями, уже стоящими на сетке, кроме старта.
  const extra: [number, number][] = [];
  cells.forEach((c, a) => {
    for (const d of ['right', 'down'] as Dir[]) {
      const b = at.get(`${c.x + DELTA[d].x},${c.y + DELTA[d].y}`);
      if (b !== undefined && a !== 0 && b !== 0 && !adj[a].includes(b)) extra.push([a, b]);
    }
  });
  for (const [a, b] of shuffle(rng, extra).slice(0, o.loops)) link(a, b);

  const dist = bfs(adj, 0);
  let goal = -1;
  dist.forEach((d, i) => {
    if (i && d <= o.goalHops && (goal < 0 || d > dist[goal])) goal = i;
  });
  if (goal < 0) return null;

  // Кратчайший путь старт → цель: от цели к соседу на переход ближе (с меньшим номером при равенстве).
  const path = [goal];
  while (path[path.length - 1] !== 0) {
    const a = path[path.length - 1];
    path.push(Math.min(...adj[a].filter(b => dist[b] === dist[a] - 1)));
  }
  path.reverse();

  // Двери — на горизонтальных мостах пути (без ребра цель недостижима), равномерно; номер растёт к цели.
  const bridges: [number, number][] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    if (cells[a].y !== cells[b].y) continue;
    const cut = (x: number, y: number) => (x === a && y === b) || (x === b && y === a);
    if (bfs(adj, 0, cut)[goal] < 0) bridges.push([a, b]);
  }
  if (bridges.length < o.doors) return null;
  const doors: DoorEdge[] = [];
  for (let k = 0; k < o.doors; k++) {
    const [a, b] = bridges[Math.floor(((k + 1) * bridges.length) / (o.doors + 1))];
    doors.push({ n: (k + 1) as 1 | 2 | 3, room: b, other: a, side: cells[a].x < cells[b].x ? 'left' : 'right' });
  }

  // Ключ k — в комнате, достижимой без дверей ≥ k: сначала тупики, из них — дальше всех от старта.
  const keys: number[] = [];
  for (let k = 1; k <= o.doors; k++) {
    const closed = doors.filter(d => d.n >= k);
    const reach = bfs(adj, 0, (x, y) => closed.some(d => (d.room === x && d.other === y) || (d.room === y && d.other === x)));
    const cand = cells.map((_, i) => i).filter(i => i !== 0 && i !== goal && reach[i] >= 0 && !keys.includes(i));
    if (!cand.length) return null;
    const leaves = cand.filter(i => adj[i].length === 1);
    const pool = leaves.length ? leaves : cand;
    keys.push(pool.reduce((best, i) => (dist[i] > dist[best] ? i : best)));
  }
  return { cells, adj, dist, goal, doors, keys };
}
