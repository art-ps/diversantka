import { NINA, TRANSITION_TIME } from './config';
import { createAnimator, updateAnimator, type Animator } from './anim/animator';
import { CLIPS } from './anim/clips';
import { androidClip, playClip } from './anim/simple';
import { IDLE, type Intent } from './input/intent';
import { createAndroid, updateAndroid, type Android } from './sim/android';
import { resolveCombat, type HitEvent } from './sim/fight';
import { spawnFloater, stepFloaters, type Floater } from './sim/floaters';
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
  floaters: Floater[];
}

export function createGame(rooms: Map<string, Room>, start: Start): Game {
  const g: Game = {
    rooms, roomId: start.room, nina: createNina(start.x, start.bottom), anim: createAnimator(), start, transition: null,
    items: [], projectiles: [], taken: new Set(), androids: [], killed: new Set(), floaters: [],
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
  g.floaters = [];
}

export function stepGame(g: Game, it: Intent, dt: number): void {
  if (g.transition) {
    g.transition.t += dt;
    if (g.transition.t >= TRANSITION_TIME) g.transition = null;
    return;
  }
  if (g.nina.dead) {
    // ponytail: в плане 1 смерть — возврат на старт; чекпоинты на терминалах — план 4.
    updateNina(g.nina, IDLE, g.rooms.get(g.roomId)!, dt);
    updateAnimator(g.anim, g.nina, CLIPS, dt);
    if (it.jumpPressed && g.nina.deadT >= NINA.respawnDelay) {
      g.taken.clear();
      enterRoom(g, g.start.room);
      g.nina = createNina(g.start.x, g.start.bottom);
      g.anim = createAnimator();
    }
    g.floaters = stepFloaters(g.floaters, dt);
    return;
  }
  const room = g.rooms.get(g.roomId)!;
  const e0 = g.nina.energy;
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
  const events: HitEvent[] = [];
  for (const id of resolveCombat(g.nina, g.androids, g.projectiles, room, events)) g.killed.add(id);
  const lost = e0 - g.nina.energy;
  const nb = g.nina.body;
  if (lost >= 0.5) spawnFloater(g.floaters, `-${Math.round(lost)}`, nb.x + nb.w / 2, nb.y - 0.6, 'damage');
  for (const e of events) {
    const a = g.androids.find(x => x.id === e.id)!;
    const text = e.result === 'killed' ? 'ВЫВЕДЕН' : e.result === 'blocked' ? 'блок' : '-1';
    spawnFloater(g.floaters, text, a.body.x + a.body.w / 2, a.body.y - 0.6, e.result === 'blocked' ? 'blocked' : 'enemy');
  }
  g.projectiles = g.projectiles.filter(p => p.alive);
  updateAnimator(g.anim, g.nina, CLIPS, dt);
  for (const a of g.androids) {
    const { name, advance } = androidClip(a, dt, CLIPS);
    playClip(a.anim, name, advance, CLIPS);
  }
  g.floaters = stepFloaters(g.floaters, dt);
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
