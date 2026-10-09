import { FLAMER, FX, NINA, TRANSITION_TIME } from './config';
import { createAnimator, updateAnimator, type Animator } from './anim/animator';
import { CLIPS } from './anim/clips';
import { androidClip, playClip, simplePose } from './anim/simple';
import { IDLE, type Intent } from './input/intent';
import { createDog, updateDog, type Dog } from './sim/dog';
import { createAndroid, updateAndroid, type Android } from './sim/android';
import { createFlamer, flamerPhase, flameRect, stepFlamer, type Flamer } from './sim/flamer';
import { resolveCombat, resolveDogs, type HitEvent } from './sim/fight';
import { spawnFloater, stepFloaters, type Floater } from './sim/floaters';
import { stepProjectiles, useThrowButton, type Item, type Projectile } from './sim/items';
import { burnNina, createNina, updateNina, type Nina } from './sim/nina';
import { crumble, sparks, stepParticles, type Particle } from './sim/particles';
import { bodyRect, overlap } from './sim/rect';
import { exitFor } from './sim/transition';
import type { Dir, Room } from './world/room';
import { figureGlyphs } from './render/figure';
import { PAL } from './render/palette';
import { parseEnemies, parseItems, type AndroidSpawn, type DogSpawn, type FlamerSpawn } from './world/spawns';

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
  particles: Particle[];
  flamers: Flamer[];
  dogs: Dog[];
  dmgAcc: number; // накопленный непоказанный урон
  dmgT: number; // сколько он копится, с
}

export function createGame(rooms: Map<string, Room>, start: Start): Game {
  const g: Game = {
    rooms, roomId: start.room, nina: createNina(start.x, start.bottom), anim: createAnimator(), start, transition: null,
    items: [], projectiles: [], taken: new Set(), androids: [], killed: new Set(), floaters: [], particles: [], flamers: [], dogs: [], dmgAcc: 0, dmgT: 0,
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
  const enemies = parseEnemies(room.meta.enemies, id).map((s, i) => ({ s, id: `${id}#e${i}` }));
  g.androids = enemies
    .filter((e): e is { s: AndroidSpawn; id: string } => e.s.kind === 'android')
    .map(e => createAndroid(e.id, e.s))
    .filter(a => !g.killed.has(a.id));
  g.flamers = enemies
    .filter((e): e is { s: FlamerSpawn; id: string } => e.s.kind === 'flamer')
    .map(e => createFlamer(e.id, e.s));
  g.dogs = enemies
    .filter((e): e is { s: DogSpawn; id: string } => e.s.kind === 'dog')
    .map(e => createDog(e.id, e.s))
    .filter(d => !g.killed.has(d.id));
  g.projectiles = [];
  g.floaters = [];
  g.particles = [];
  g.dmgAcc = 0;
  g.dmgT = 0;
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
    if (g.dmgAcc >= 0.5) {
      const db = g.nina.body;
      spawnFloater(g.floaters, `-${Math.round(g.dmgAcc)}`, db.x + db.w / 2, db.y - 0.6, 'damage');
    }
    g.dmgAcc = 0;
    g.dmgT = 0;
    g.floaters = stepFloaters(g.floaters, dt);
    g.particles = stepParticles(g.particles, dt);
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
  for (const d of g.dogs) updateDog(d, g.nina, room, dt);
  const events: HitEvent[] = [];
  for (const id of resolveCombat(g.nina, g.androids, g.projectiles, room, events)) g.killed.add(id);
  for (const id of resolveDogs(g.nina, g.dogs, g.projectiles, events)) g.killed.add(id);
  for (const f of g.flamers) {
    stepFlamer(f, dt);
    const r = flameRect(f);
    if (r && overlap(r, bodyRect(g.nina.body))) burnNina(g.nina, FLAMER.dps * dt);
    if (r) {
      // Огонь из частиц: летят от сопла вдоль струи и гаснут к её концу.
      const n = Math.round(FLAMER.sparksPerSec * dt + Math.random() * 0.999);
      for (let i = 0; i < n; i++) {
        const v = FLAMER.length / 0.35;
        g.particles.push({ ch: '~*^,'[Math.floor(Math.random() * 4)], x: f.x, y: f.y + (Math.random() - 0.5) * FLAMER.halfH, vx: f.dir * v * (0.8 + 0.4 * Math.random()), vy: (Math.random() - 0.5) * 2, t: 0, life: 0.35, gravity: -3, size: 0.6, color: Math.random() < 0.4 ? PAL.fireHot : PAL.fire });
      }
    } else if (flamerPhase(f) === 'warn' && Math.random() < dt * 12) {
      sparks(g.particles, f.x + f.dir * 0.3, f.y, PAL.fireHot, 2);
    }
  }
  const lost = e0 - g.nina.energy;
  const nb = g.nina.body;
  if (lost > 0) {
    g.dmgAcc += lost;
    g.dmgT += dt;
  }
  // Удар — число на следующем кадре; огонь копится и показывается раз в FX.damageFlush.
  if (g.dmgAcc >= 0.5 && (lost <= 0 || g.dmgT >= FX.damageFlush)) {
    spawnFloater(g.floaters, `-${Math.round(g.dmgAcc)}`, nb.x + nb.w / 2, nb.y - 0.6, 'damage');
    g.dmgAcc = 0;
    g.dmgT = 0;
  } else if (lost <= 0) {
    g.dmgAcc = 0;
    g.dmgT = 0;
  }
  for (const e of events) {
    const a = g.androids.find(x => x.id === e.id);
    const d = a ? undefined : g.dogs.find(x => x.id === e.id)!;
    const body = (a ?? d)!.body;
    const text = e.result === 'killed' ? 'ВЫВЕДЕН' : e.result === 'blocked' ? 'блок' : '-1';
    const cx = body.x + body.w / 2;
    spawnFloater(g.floaters, text, cx, body.y - 0.6, e.result === 'blocked' ? 'blocked' : 'enemy');
    sparks(g.particles, cx, body.y + 1, PAL.spark);
    if (e.result === 'killed') {
      if (a) {
        // андроид смотрит на ударившего — разлёт от него
        crumble(g.particles, figureGlyphs(simplePose(a.anim, CLIPS), cx, a.body.y + a.body.h, a.facing, PAL.android, false, '@'), -a.facing as 1 | -1);
        a.gone = true;
      } else if (d) {
        // ponytail: символьный распад собаки — Task 5 (dogGlyphs); пока искры.
        sparks(g.particles, cx, d.body.y + 0.7, PAL.danger, 14);
        d.gone = true;
      }
    }
  }
  for (const p of g.projectiles) if (!p.alive && p.hitWall) sparks(g.particles, p.x, p.y, PAL.spark, 4);
  g.projectiles = g.projectiles.filter(p => p.alive);
  updateAnimator(g.anim, g.nina, CLIPS, dt);
  for (const a of g.androids) {
    const { name, advance } = androidClip(a, dt, CLIPS);
    playClip(a.anim, name, advance, CLIPS);
  }
  g.floaters = stepFloaters(g.floaters, dt);
  g.particles = stepParticles(g.particles, dt);
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
