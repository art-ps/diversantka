import { TRANSITION_TIME } from './config';
import { createAnimator, updateAnimator, type Animator } from './anim/animator';
import { CLIPS } from './anim/clips';
import type { Intent } from './input/intent';
import { createAndroid, updateAndroid, type Android } from './sim/android';
import { resolveCombat } from './sim/fight';
import { stepProjectiles, useThrowButton, type Item, type Projectile } from './sim/items';
import { createNina, updateNina, type Nina } from './sim/nina';
import { exitFor } from './sim/transition';
import type { Dir, Room } from './world/room';
import { parseEnemies, parseItems } from './world/spawns';

export { TRANSITION_TIME };

export interface Start { room: string; x: number; bottom: number }

export interface Game {
  rooms: Map<string, Room>;
  roomId: string;
  nina: Nina;
  anim: Animator;
  start: Start;
  transition: { from: string; dir: Dir; t: number } | null;
  items: Item[];
  projectiles: Projectile[];
  taken: Set<string>; // подобранные предметы — не появляются снова до смерти
  androids: Android[];
  killed: Set<string>; // убитые андроиды — не возвращаются до конца миссии
}

export function createGame(rooms: Map<string, Room>, start: Start): Game {
  const g: Game = {
    rooms, roomId: start.room, nina: createNina(start.x, start.bottom), anim: createAnimator(), start, transition: null,
    items: [], projectiles: [], taken: new Set(), androids: [], killed: new Set(),
  };
  enterRoom(g, start.room);
  return g;
}

// Состояние комнаты при входе: предметы (кроме подобранных), без снарядов.
export function enterRoom(g: Game, id: string): void {
  g.roomId = id;
  const room = g.rooms.get(id)!;
  g.items = parseItems(room.meta.items, id)
    .map((s, i) => ({ id: `${id}#i${i}`, ...s }))
    .filter(i => !g.taken.has(i.id));
  g.androids = parseEnemies(room.meta.enemies, id)
    .map((s, i) => createAndroid(`${id}#e${i}`, s))
    .filter(a => !g.killed.has(a.id));
  g.projectiles = [];
}

export function stepGame(g: Game, it: Intent, dt: number): void {
  if (g.transition) {
    g.transition.t += dt;
    if (g.transition.t >= TRANSITION_TIME) g.transition = null;
    return;
  }
  if (g.nina.dead) {
    // ponytail: в плане 1 смерть — возврат на старт; чекпоинты на терминалах — план 4.
    updateAnimator(g.anim, g.nina, CLIPS, dt);
    if (it.jumpPressed) {
      g.taken.clear();
      enterRoom(g, g.start.room);
      g.nina = createNina(g.start.x, g.start.bottom);
      g.anim = createAnimator();
    }
    return;
  }
  const room = g.rooms.get(g.roomId)!;
  updateNina(g.nina, it, room, dt);
  const { picked, thrown } = useThrowButton(g.nina, it, g.items);
  if (picked) {
    g.taken.add(picked.id);
    g.items = g.items.filter(i => i !== picked);
  }
  if (thrown) g.projectiles.push(thrown);
  stepProjectiles(g.projectiles, room, dt);
  for (const a of g.androids) {
    const k = updateAndroid(a, g.nina, room, dt);
    if (k) g.projectiles.push(k);
  }
  for (const id of resolveCombat(g.nina, g.androids, g.projectiles)) g.killed.add(id);
  g.projectiles = g.projectiles.filter(p => p.alive);
  updateAnimator(g.anim, g.nina, CLIPS, dt);
  const ex = exitFor(g.nina.body, room);
  if (ex) {
    g.nina.body.x += ex.dx;
    g.nina.body.y += ex.dy;
    g.nina.peakY += ex.dy;
    g.anim.peakY += ex.dy;
    g.anim.lastY += ex.dy;
    g.transition = { from: g.roomId, dir: ex.dir, t: 0 };
    enterRoom(g, ex.to);
  }
}
