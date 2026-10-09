import { FIRE, FLAMER, FX, MISSION, NINA, TRANSITION_TIME } from './config';
import { jetFire, pitFires, stepFires, type Fire } from './fx/fires';
import { createAnimator, updateAnimator, type Animator } from './anim/animator';
import { dogGlyphs } from './anim/dog';
import { CLIPS } from './anim/clips';
import { androidClip, playClip, simplePose } from './anim/simple';
import { IDLE, type Intent } from './input/intent';
import { createDog, updateDog, type Dog } from './sim/dog';
import { createAndroid, updateAndroid, type Android } from './sim/android';
import { createFlamer, flamerPhase, flameRect, stepFlamer, type Flamer } from './sim/flamer';
import { resolveCombat, resolveDogs, type HitEvent } from './sim/fight';
import { spawnFloater, stepFloaters, type Floater } from './sim/floaters';
import { stepProjectiles, itemRect, useThrowButton, type Item, type Projectile } from './sim/items';
import { createMission, saveCheckpoint, tickTimer, type Mission } from './sim/mission';
import { openScreen, stepScreen, type Screen } from './sim/terminal';
import { burnNina, createNina, updateNina, type Nina } from './sim/nina';
import { crumble, smoke, sparks, splash, stepParticles, type Particle } from './sim/particles';
import { bodyRect, overlap } from './sim/rect';
import { touchesTile, touchHazards } from './sim/hazards';
import { exitFor } from './sim/transition';
import type { Dir, Room } from './world/room';
import { figureGlyphs } from './render/figure';
import { PAL } from './render/palette';
import { parseEnemies, parseItems, parsePoints, parseTerminals, type AndroidSpawn, type DogSpawn, type FlamerSpawn, type Point, type TerminalSpawn } from './world/spawns';

export { TRANSITION_TIME };

export interface Start { room: string; x: number; bottom: number }
export interface Tape { id: string; x: number; bottom: number }

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
  fires: Fire[];
  dogs: Dog[];
  dmgAcc: number; // накопленный непоказанный урон
  dmgT: number; // сколько он копится, с
  inWater: boolean;
  mission: Mission;
  tapes: Tape[]; // ленты комнаты, ещё не подобранные
  terminals: TerminalSpawn[]; // терминалы комнаты
  screen: Screen | null; // открытый экран ЭВМ — мир стоит
}

export function createGame(rooms: Map<string, Room>, start: Start): Game {
  const g: Game = {
    rooms, roomId: start.room, nina: createNina(start.x, start.bottom), anim: createAnimator(), start, transition: null,
    items: [], projectiles: [], taken: new Set(), androids: [], killed: new Set(), floaters: [], particles: [], flamers: [], fires: [], dogs: [], dmgAcc: 0, dmgT: 0, inWater: false, mission: createMission(start), tapes: [], terminals: [], screen: null,
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
  g.tapes = parsePoints(room.meta.tapes, id, 'ленты')
    .map((p, i) => ({ id: `${id}#t${i}`, ...p }))
    .filter(t => !g.mission.tapes.has(t.id));
  const enemies = parseEnemies(room.meta.enemies, id).map((s, i) => ({ s, id: `${id}#e${i}` }));
  g.androids = enemies
    .filter((e): e is { s: AndroidSpawn; id: string } => e.s.kind === 'android')
    .map(e => createAndroid(e.id, e.s))
    .filter(a => !g.killed.has(a.id));
  g.flamers = enemies
    .filter((e): e is { s: FlamerSpawn; id: string } => e.s.kind === 'flamer')
    .map(e => createFlamer(e.id, e.s));
  applyFlamers(g);
  g.fires = [...pitFires(room), ...g.flamers.map(jetFire)];
  g.terminals = parseTerminals(room.meta.terminals, id);
  g.dogs = enemies
    .filter((e): e is { s: DogSpawn; id: string } => e.s.kind === 'dog')
    .map(e => createDog(e.id, e.s))
    .filter(d => !g.killed.has(d.id));
  g.projectiles = [];
  g.floaters = [];
  g.particles = [];
  g.dmgAcc = 0;
  g.dmgT = 0;
  g.inWater = false;
}

// Огнемёты комнаты, выключенной с терминала, молчат.
function applyFlamers(g: Game): void {
  for (const f of g.flamers) f.off = g.mission.flamersOff.has(g.roomId);
}

// Чекпоинт у терминала: героиня возродится перед ним.
function checkpointAt(g: Game, t: TerminalSpawn): void {
  saveCheckpoint(g.mission, { room: g.roomId, x: t.x - NINA.w / 2, bottom: t.bottom });
  applyFlamers(g);
}

// Рядом с объектом: стоит на его уровне, центр не дальше useRange.
const near = (n: Nina, p: Point) =>
  n.state === 'ground' && Math.abs(n.body.x + n.body.w / 2 - p.x) <= MISSION.useRange && Math.abs(n.body.y + n.body.h - p.bottom) < 0.5;

export function stepGame(g: Game, it: Intent, dt: number): void {
  if (g.mission.result) return; // конец миссии — экраны итога в Task 6
  tickTimer(g.mission, dt); // таймер идёт всегда: в переходе, после гибели, на экране ЭВМ
  if (g.mission.result) {
    g.screen = null; // таймер 0 — провал, мир стоит
    return;
  }
  if (g.screen) {
    const r = stepScreen(g.screen, g.mission, it, dt);
    if (r === 'changed') checkpointAt(g, g.screen.term);
    if (r === 'close') g.screen = null;
    return; // мир стоит; нажатие, закрывшее экран, в мир не уходит
  }
  if (g.transition) {
    g.transition.t += dt;
    if (g.transition.t >= TRANSITION_TIME) g.transition = null;
    stepFires(g.fires, g.flamers, dt);
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
    stepFires(g.fires, g.flamers, dt);
    return;
  }
  const room = g.rooms.get(g.roomId)!;
  const e0 = g.nina.energy;
  const inv0 = g.nina.invulnT; // выросла за шаг — получен удар
  if (it.usePressed) {
    const t = g.terminals.find(t => near(g.nina, t));
    if (t) {
      g.screen = openScreen(t);
      checkpointAt(g, t);
      return;
    }
  }
  updateNina(g.nina, it, room, dt);
  touchHazards(g.nina, room, dt);
  const wet = touchesTile(g.nina, room, '~');
  const feet = g.nina.body;
  if (wet && !g.inWater) splash(g.particles, feet.x + feet.w / 2, feet.y + feet.h - 0.3, FX.splashBurst);
  else if (wet && Math.abs(feet.vx) > 1 && Math.random() < FX.splashPerSec * dt) splash(g.particles, feet.x + feet.w / 2, feet.y + feet.h - 0.3, 1);
  g.inWater = wet;
  const { picked, thrown } = useThrowButton(g.nina, it, g.items);
  if (picked) {
    g.taken.add(picked.id);
    g.items = g.items.filter(i => i !== picked);
  }
  if (thrown) g.projectiles.push(thrown);
  // Ленты — в сумку касанием, руки остаются свободными.
  const nr = bodyRect(g.nina.body);
  for (const t of g.tapes) {
    if (!overlap(itemRect(t), nr)) continue;
    g.mission.tapes.add(t.id);
    spawnFloater(g.floaters, `ЛЕНТА ${g.mission.tapes.size}/${MISSION.tapes}`, t.x, t.bottom - 1.5, 'enemy');
  }
  g.tapes = g.tapes.filter(t => !g.mission.tapes.has(t.id));
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
  stepFires(g.fires, g.flamers, dt);
  if (g.nina.invulnT > inv0) g.mission.hits++;
  // Дым: над ямами — всегда, над концом струи — пока она горит.
  for (const fire of g.fires) {
    if (fire.kind === 'pit') {
      const width = fire.field.w / 2;
      const n = Math.floor(FX.smokePerSec * width * dt + Math.random());
      if (n) smoke(g.particles, fire.x + Math.random() * width, fire.y - 1 - FIRE.pitRise, n);
    } else if (fire.field.on && Math.random() < FX.smokePerSec * dt) {
      smoke(g.particles, fire.x + fire.dir * FLAMER.length, fire.y - FIRE.jetLift * FLAMER.length - 0.5, 1);
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
        smoke(g.particles, cx, body.y + body.h / 2, FX.smokePuff);
        a.gone = true;
      } else if (d) {
        crumble(g.particles, dogGlyphs(d, PAL.dog), -d.facing as 1 | -1);
        smoke(g.particles, cx, body.y + body.h / 2, FX.smokePuff);
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
