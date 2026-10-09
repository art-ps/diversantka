import { TRANSITION_TIME } from './config';
import type { Intent } from './input/intent';
import { createNina, updateNina, type Nina } from './sim/nina';
import { exitFor } from './sim/transition';
import type { Dir, Room } from './world/room';

export { TRANSITION_TIME };

export interface Start { room: string; x: number; bottom: number }

export interface Game {
  rooms: Map<string, Room>;
  roomId: string;
  nina: Nina;
  start: Start;
  transition: { from: string; dir: Dir; t: number } | null;
}

export function createGame(rooms: Map<string, Room>, start: Start): Game {
  return { rooms, roomId: start.room, nina: createNina(start.x, start.bottom), start, transition: null };
}

export function stepGame(g: Game, it: Intent, dt: number): void {
  if (g.transition) {
    g.transition.t += dt;
    if (g.transition.t >= TRANSITION_TIME) g.transition = null;
    return;
  }
  if (g.nina.dead) {
    // ponytail: в плане 1 смерть — возврат на старт; чекпоинты на терминалах — план 4.
    if (it.jumpPressed) {
      g.roomId = g.start.room;
      g.nina = createNina(g.start.x, g.start.bottom);
    }
    return;
  }
  const room = g.rooms.get(g.roomId)!;
  updateNina(g.nina, it, room, dt);
  const ex = exitFor(g.nina.body, room);
  if (ex) {
    g.nina.body.x += ex.dx;
    g.nina.body.y += ex.dy;
    g.nina.peakY += ex.dy;
    g.transition = { from: g.roomId, dir: ex.dir, t: 0 };
    g.roomId = ex.to;
  }
}
