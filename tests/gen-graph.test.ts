import { describe, expect, it } from 'vitest';
import { doorCount, goalOf, loopsOf, maxGoalHops, roomsOf } from '../src/gen/difficulty';
import { bfs, buildGraph, dirTo, type Graph, type GraphOpts } from '../src/gen/graph';
import { mulberry32 } from '../src/gen/rng';

const opts = (n: number): GraphOpts => ({ rooms: roomsOf(n), loops: loopsOf(n), doors: doorCount(n), goalHops: goalOf(n) === 'bomb' ? maxGoalHops : Infinity });
const graphs = (n: number, seeds = 100): Graph[] =>
  Array.from({ length: seeds }, (_, s) => buildGraph(mulberry32(s), opts(n))).filter((g): g is Graph => g !== null);
const edgeIs = (a: number, b: number, x: number, y: number) => (a === x && b === y) || (a === y && b === x);

it('один seed — один граф', () => {
  expect(buildGraph(mulberry32(7), opts(8))).toEqual(buildGraph(mulberry32(7), opts(8)));
});

it('граф собирается хотя бы на десятой части seed-ов на уровнях 3, 4, 9, 20, 30', () => {
  for (const n of [3, 4, 9, 20, 30]) expect(graphs(n).length, `уровень ${n}`).toBeGreaterThanOrEqual(10);
});

describe.each([3, 4, 8, 9, 20, 30])('уровень %i', n => {
  const all = graphs(n);
  const o = opts(n);
  const W = Math.ceil(Math.sqrt(o.rooms * 1.5)), H = Math.ceil(o.rooms / W) + 1;

  it('клетки: нужное число, разные, в сетке; старт в верхнем ряду без соседей слева и сверху', () => {
    for (const g of all) {
      expect(g.cells).toHaveLength(o.rooms);
      expect(new Set(g.cells.map(c => `${c.x},${c.y}`)).size).toBe(o.rooms);
      for (const c of g.cells) expect(c.x >= 0 && c.x < W && c.y >= 0 && c.y < H).toBe(true);
      expect(g.cells[0].y).toBe(0);
      for (const j of g.adj[0]) expect(['right', 'down']).toContain(dirTo(g.cells[0], g.cells[j]));
    }
  });

  it('рёбра: симметричны, между соседними клетками, связный граф; петель не больше заданного', () => {
    for (const g of all) {
      let edges = 0;
      g.adj.forEach((ns, a) => {
        for (const b of ns) {
          expect(g.adj[b]).toContain(a);
          expect(Math.abs(g.cells[a].x - g.cells[b].x) + Math.abs(g.cells[a].y - g.cells[b].y)).toBe(1);
          edges++;
        }
      });
      expect(edges / 2).toBeLessThanOrEqual(o.rooms - 1 + o.loops);
      expect(bfs(g.adj, 0).every(d => d >= 0)).toBe(true);
      expect(g.dist).toEqual(bfs(g.adj, 0));
    }
  });

  it('цель: не старт, не дальше goalHops, самая дальняя из таких', () => {
    for (const g of all) {
      expect(g.goal).not.toBe(0);
      expect(g.dist[g.goal]).toBeLessThanOrEqual(o.goalHops);
      expect(Math.max(...g.dist.filter(d => d <= o.goalHops))).toBe(g.dist[g.goal]);
    }
  });

  it('двери: заданное число, на горизонтальных мостах к цели, номера растут к цели, сторона — к старту', () => {
    for (const g of all) {
      expect(g.doors.map(d => d.n)).toEqual(Array.from({ length: o.doors }, (_, i) => i + 1));
      for (const d of g.doors) {
        expect(g.adj[d.room]).toContain(d.other);
        expect(g.cells[d.room].y).toBe(g.cells[d.other].y);
        expect(d.side).toBe(g.cells[d.other].x < g.cells[d.room].x ? 'left' : 'right');
        expect(g.dist[d.other]).toBeLessThan(g.dist[d.room]);
        expect(bfs(g.adj, 0, (a, b) => edgeIs(a, b, d.room, d.other))[g.goal]).toBe(-1); // мост: без неё к цели не пройти
      }
      for (let k = 1; k < g.doors.length; k++) expect(g.dist[g.doors[k].room]).toBeGreaterThan(g.dist[g.doors[k - 1].room]);
    }
  });

  it('ключи: по одному на дверь, разные комнаты, не старт и не цель; ключ k достижим без дверей ≥ k', () => {
    for (const g of all) {
      expect(g.keys).toHaveLength(o.doors);
      expect(new Set(g.keys).size).toBe(o.doors);
      g.keys.forEach((r, i) => {
        const k = i + 1;
        expect(r).not.toBe(0);
        expect(r).not.toBe(g.goal);
        const closed = g.doors.filter(d => d.n >= k);
        expect(bfs(g.adj, 0, (a, b) => closed.some(d => edgeIs(a, b, d.room, d.other)))[r]).toBeGreaterThanOrEqual(0);
      });
    }
  });

  it('ключи: не в комнате с тайлами любой двери и минимум в двух переходах от своей', () => {
    for (const g of all) {
      g.keys.forEach((r, i) => {
        for (const d of g.doors) expect(r).not.toBe(d.other);
        expect(bfs(g.adj, g.doors[i].other)[r]).toBeGreaterThanOrEqual(2);
      });
    }
  });
});
