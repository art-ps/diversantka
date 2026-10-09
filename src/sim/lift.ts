import { LIFT, ROOM_H } from '../config';
import type { Room } from '../world/room';
import { parseLift } from '../world/spawns';
import type { Rect } from './rect';

const EPS = 1e-6;
export const LIFT_W = 3; // платформа — 3 клетки

// Строки по вертикали — в координатах верхней комнаты шахты: rooms[k] занимает строки 25k..25k+24.
export interface Lift {
  id: string; // комната верха шахты — в её шапке «lift:»
  x: number; // левая колонка платформы
  stops: number[]; // этажи — верх платформы, по возрастанию
  rooms: string[]; // комнаты шахты сверху вниз
  y: number; // верх платформы сейчас
  target: number | null; // этаж, куда едет
  rest: number; // после остановки ещё стоит, с
}

// Комнаты шахты сверху вниз по выходам down до строки bottom; null — шахта уходит в комнату, которой нет.
export function shaftRooms(rooms: Map<string, Room>, topId: string, bottom: number): string[] | null {
  const out = [topId];
  while (out.length * ROOM_H <= bottom) {
    const next = rooms.get(out[out.length - 1])?.exits.down;
    if (!next || !rooms.has(next)) return null;
    out.push(next);
  }
  return out;
}

// Лифты карты; каждый стоит на верхнем этаже.
export function createLifts(rooms: Map<string, Room>): Lift[] {
  const out: Lift[] = [];
  for (const r of rooms.values()) {
    const s = parseLift(r.meta.lift, r.id);
    if (!s) continue;
    const shaft = shaftRooms(rooms, r.id, s.stops[s.stops.length - 1]) ?? [r.id];
    out.push({ id: r.id, x: s.x, stops: s.stops, rooms: shaft, y: s.stops[0], target: null, rest: 0 });
  }
  return out;
}

// Верх платформы в строках комнаты roomId; null — шахта через эту комнату не идёт.
export function liftTop(l: Lift, roomId: string): number | null {
  const k = l.rooms.indexOf(roomId);
  return k < 0 ? null : l.y - k * ROOM_H;
}

export function liftRect(l: Lift, roomId: string): Rect | null {
  const y = liftTop(l, roomId);
  return y === null ? null : { x: l.x, y, w: LIFT_W, h: 1 };
}

// Следующий этаж выше (dir −1) или ниже (dir 1); null — дальше этажей нет.
export function nextStop(l: Lift, dir: 1 | -1): number | null {
  const s = dir < 0 ? [...l.stops].reverse().find(v => v < l.y - EPS) : l.stops.find(v => v > l.y + EPS);
  return s ?? null;
}

// Шаг: едет к target с постоянной скоростью, на месте останавливается и стоит LIFT.dwell.
export function stepLift(l: Lift, dt: number): void {
  l.rest = Math.max(0, l.rest - dt);
  if (l.target === null) return;
  const d = l.target - l.y;
  if (Math.abs(d) <= LIFT.speed * dt + EPS) {
    l.y = l.target;
    l.target = null;
    l.rest = LIFT.dwell;
  } else l.y += Math.sign(d) * LIFT.speed * dt;
}
