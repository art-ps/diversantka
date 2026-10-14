import { ANIM, BOMB, CAMERA, FIRE, FLAMER, FX, LIFT, MISSION, NINA, PROLOGUE, ROOM_H, ROOM_W, SFX, SOURCE, TRANSITION_TIME } from './config';
import { bombFire, bombHeat, jetFire, pitFires, stepFires, type Fire } from './fx/fires';
import { createAnimator, updateAnimator, type Animator } from './anim/animator';
import { dogGlyphs } from './anim/dog';
import { CLIPS } from './anim/clips';
import { androidClip, guardClip, playClip, simplePose } from './anim/simple';
import { IDLE, type Intent } from './input/intent';
import { createDog, updateDog, type Dog } from './sim/dog';
import { createAndroid, updateAndroid, type Android } from './sim/android';
import { beamTarget, createCamera, stepCameras, type Camera } from './sim/camera';
import { doorId, doorsOf, doorSpot, gateRows, gatesOf, keyDoor, pushFromGate, solidRoom, type Door, type Gate } from './sim/doors';
import { createFlamer, flamerPhase, flameRect, stepFlamer, type Flamer } from './sim/flamer';
import { resolveCombat, resolveDogs, resolveGuards, type HitEvent } from './sim/fight';
import { createGuard, updateGuard, type Guard } from './sim/guard';
import { spawnFloater, stepFloaters, type Floater } from './sim/floaters';
import { stepProjectiles, itemRect, useThrowButton, type Item, type Projectile } from './sim/items';
import { gliderAt, gliderHits, ROUTE, ROUTE_LEN } from './sim/glider';
import { createLifts, LIFT_W, liftRect, liftTop, nextStop, stepLift, type Lift } from './sim/lift';
import { createMission, elapsed, fuseTick, missionResult, plantBomb, restoreCheckpoint, saveCheckpoint, startBike, tickTimer, useSwitch, type Mission } from './sim/mission';
import { openScreen, stepScreen, type Controls, type Screen } from './sim/terminal';
import { burnNina, createNina, updateNina, type Nina, type NinaState } from './sim/nina';
import type { Attack } from './sim/combat';
import type { Sfx } from './sim/sfx';
import type { Board } from './save';
import { crumble, smoke, sparks, splash, stepParticles, type Particle } from './sim/particles';
import { overTop } from './sim/physics';
import { decodeIntent, encodeIntent } from './sim/record';
import { bodyRect, overlap, type Rect } from './sim/rect';
import { touchesTile, touchHazards } from './sim/hazards';
import { exitFor } from './sim/transition';
import type { Dir, Room } from './world/room';
import { setLang, str } from './i18n';
import { MISSIONS, type MissionNo } from './missions';
import { figureGlyphs } from './render/figure';
import { PAL } from './render/palette';
import { parseCameras, parseEnemies, parseFence, parseItems, parsePoints, parseTerminals, type AndroidSpawn, type DogSpawn, type Fence, type GuardSpawn, type FlamerSpawn, type Point, type TerminalSpawn } from './world/spawns';

export { TRANSITION_TIME };

export interface Start { room: string; x: number; bottom: number }
export interface Tape { id: string; x: number; bottom: number }
// Пролог: d — путь дельтаплана, t — секунд в текущей фазе; title — стартовый экран, дельтаплан ждёт прыжка.
export interface Prologue { d: number; phase: 'title' | 'fly' | 'fall' | 'splash' | 'crash'; t: number }

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
  splashAcc: number; // накопленные брызги при ходьбе по воде
  mission: Mission;
  tapes: Tape[]; // ленты комнаты, ещё не подобранные
  terminals: TerminalSpawn[]; // терминалы комнаты
  screen: Screen | null; // открытый экран ЭВМ — мир стоит
  panel: Point | null; // щиток забора
  bike: Point | null;
  source: Point | null; // источник в секретной комнате
  fence: Fence | null;
  endT: number; // секунд с конца миссии: выезд, затем итог
  clip: string | null; // строка итога для буфера обмена — забирает main.ts
  copied: boolean; // буфер обмена принял строку — ставит main.ts
  prologue: Prologue | null; // идёт пролог — таймер миссии стоит
  withPrologue: boolean; // «заново» начинает с пролога
  lifts: Lift[]; // лифты всей карты: где платформа, сохраняется между комнатами
  paused: boolean; // пауза с картой: мир и таймер стоят
  seen: Set<string>; // комнаты, где героиня побывала за миссию (для карты); чекпоинт не откатывает
  sfx: Sfx[]; // звуковые события с прошлого кадра — забирает и очищает main.ts
  stepAcc: number; // путь с прошлого звука шага, клетки
  liftHum: boolean; // звучит гул лифта в пути
  jetHiss: boolean; // звучит струя огнемёта
  replay: boolean; // идёт реплей по ссылке ?r= — ставит main.ts; HUD показывает подсказку вместо id комнаты
  board: Board | null; // рекорды для экрана итогов — ставит main.ts при победе
  rec: number[]; // запись нажатий с начала полёта (src/sim/record.ts); повтор пролога и «заново» начинают её с нуля
  doors: Door[]; // двери комнаты (тайлы 1–3)
  heldId: string | null; // id предмета в руках героини — чтобы потратить ключ навсегда
  spent: Set<string>; // потраченные предметы (ключ открыл дверь) — не возвращаются и после гибели
  guards: Guard[]; // охрана комнаты; убитые — в killed, как андроиды
  cameras: Camera[]; // камеры комнаты
  gates: Gate[]; // решётки комнаты (тайлы A)
  alarmT: number; // осталось тревоги в комнате, с; 0 — тихо. Выход из комнаты тревогу снимает
  alarmAge: number; // с начала текущей тревоги, с — по нему сирена; повторное попадание в луч его не сбрасывает
  gate: number; // решётки комнаты: 0 — подняты, 1 — опущены
  bombSite: Point | null; // точка закладки взрывчатки в комнате («bomb:»)
  missionId: MissionNo; // какая миссия идёт: набор комнат, таймер и цель — MISSIONS[missionId]
}

export function createGame(rooms: Map<string, Room>, start: Start, missionId: MissionNo = 1): Game {
  const { goal, time } = MISSIONS[missionId];
  const g: Game = {
    rooms, roomId: start.room, nina: createNina(start.x, start.bottom), anim: createAnimator(), start, transition: null,
    items: [], projectiles: [], taken: new Set(), androids: [], killed: new Set(), floaters: [], particles: [], flamers: [], fires: [], dogs: [], dmgAcc: 0, dmgT: 0, inWater: false, splashAcc: 0, mission: createMission(start, goal, time), tapes: [], terminals: [], screen: null, panel: null, bike: null, source: null, fence: null, endT: 0, clip: null, copied: false, prologue: null, withPrologue: false,
    lifts: createLifts(rooms), paused: false, seen: new Set(), sfx: [], stepAcc: 0, liftHum: false, jetHiss: false, replay: false, board: null, rec: [],
    doors: [], heldId: null, spent: new Set(), guards: [], cameras: [], gates: [], alarmT: 0, alarmAge: 0, gate: 0, bombSite: null, missionId,
  };
  enterRoom(g, start.room);
  return g;
}

// Новая игра с пролога: дельтаплан над морем, миссия начнётся после посадки.
// title — сначала стартовый экран (запуск и «заново»); рестарт после всплеска или мачты — сразу полёт.
export function createPrologue(rooms: Map<string, Room>, title = false): Game {
  const g = createGame(rooms, MISSIONS[1].start);
  g.prologue = { d: PROLOGUE.startD, phase: title ? 'title' : 'fly', t: 0 };
  g.withPrologue = true;
  return g;
}

// Посадка: место — стартовый чекпоинт, таймер пошёл.
function beginMission(g: Game): void {
  const b = g.nina.body;
  g.start = { room: g.roomId, x: b.x, bottom: b.y + b.h };
  g.mission = createMission(g.start, MISSIONS[g.missionId].goal, MISSIONS[g.missionId].time);
  g.prologue = null;
}

// Полёт: дельтаплан ведёт сам, прыжок — отцепиться; всплеск и удар — пролог заново.
function stepPrologue(g: Game, p: Prologue, it: Intent, dt: number): void {
  if (p.phase === 'title') {
    // Строка «< ENGLISH · РУССКИЙ >»: влево — English, вправо — русский; удержание ничего не листает.
    if (it.moveX < 0) setLang('en');
    else if (it.moveX > 0) setLang('ru');
    if (it.jumpPressed) p.phase = 'fly'; // это нажатие не отцепляет: полёт начинается с t = 0, окно armTime
    return;
  }
  p.t += dt;
  g.particles = stepParticles(g.particles, dt);
  if (p.phase !== 'fly') {
    if (p.t >= PROLOGUE.retryDelay) Object.assign(g, createPrologue(g.rooms));
    return;
  }
  if (g.transition) {
    // Смена экрана: мир стоит, прыжок не отцепляет.
    g.transition.t += dt;
    if (g.transition.t >= TRANSITION_TIME) g.transition = null;
    return;
  }
  if (it.jumpPressed && p.t >= PROLOGUE.armTime) {
    p.phase = 'fall'; // дальше — обычная физика героини, вперёд по инерции
    g.nina.body.vx = PROLOGUE.speed;
    return;
  }
  p.d += PROLOGUE.speed * dt;
  const a = gliderAt(p.d);
  const id = ROUTE[a.screen];
  if (id !== g.roomId) {
    g.transition = { from: g.roomId, dir: 'right', t: 0 };
    enterRoom(g, id);
  }
  const b = g.nina.body;
  b.x = a.x - b.w / 2;
  b.y = a.bottom - b.h;
  g.nina.peakY = b.y; // урон от падения — с высоты отцепления
  if (gliderHits(g.rooms.get(id)!, a) || p.d >= ROUTE_LEN) {
    p.phase = 'crash';
    p.t = 0;
    sparks(g.particles, Math.min(a.x + PROLOGUE.span / 2, ROOM_W), a.bottom - PROLOGUE.height / 2, PAL.spark, 12);
    g.sfx.push('mast');
  }
}

// Состояние комнаты при входе: предметы (кроме подобранных), без снарядов.
export function enterRoom(g: Game, id: string): void {
  g.roomId = id;
  const room = g.rooms.get(id)!;
  g.items = parseItems(room.meta.items, id)
    .map((s, i) => ({ id: `${id}#i${i}`, ...s }))
    .filter(i => !g.taken.has(i.id) && !g.spent.has(i.id));
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
  g.cameras = parseCameras(room.meta.cameras, id).map((s, i) => createCamera(`${id}#c${i}`, s));
  applyTerminals(g);
  g.bombSite = parsePoints(room.meta.bomb, id, 'точки закладки')[0] ?? null;
  g.fires = [...pitFires(room), ...g.flamers.map(jetFire), ...(g.bombSite && g.mission.fuse !== null ? [bombFire(g.bombSite)] : [])];
  g.terminals = parseTerminals(room.meta.terminals, id);
  g.panel = parsePoints(room.meta.switch, id, 'щитка')[0] ?? null;
  g.bike = parsePoints(room.meta.bike, id, 'мотоцикла')[0] ?? null;
  g.source = parsePoints(room.meta.source, id, 'источника')[0] ?? null;
  g.fence = parseFence(room.meta.fence, id);
  g.doors = doorsOf(room);
  g.gates = gatesOf(room);
  g.alarmT = 0;
  g.alarmAge = 0;
  g.gate = 0;
  g.dogs = enemies
    .filter((e): e is { s: DogSpawn; id: string } => e.s.kind === 'dog')
    .map(e => createDog(e.id, e.s))
    .filter(d => !g.killed.has(d.id));
  g.guards = enemies
    .filter((e): e is { s: GuardSpawn; id: string } => e.s.kind === 'guard')
    .map(e => createGuard(e.id, e.s))
    .filter(gd => !g.killed.has(gd.id));
  g.projectiles = [];
  g.floaters = [];
  g.particles = [];
  g.dmgAcc = 0;
  g.dmgT = 0;
  g.inWater = false;
}

// Огнемёты и камеры комнаты, выключенные с терминала, молчат.
function applyTerminals(g: Game): void {
  for (const f of g.flamers) f.off = g.mission.flamersOff.has(g.roomId);
  for (const c of g.cameras) c.off = g.mission.camerasOff.has(g.roomId);
}

// Что гасит терминал в комнате из controls — по шапке комнаты.
const controlsOf = (g: Game): Controls => id => {
  const r = g.rooms.get(id);
  return { flamers: parseEnemies(r?.meta.enemies, id).some(e => e.kind === 'flamer'), cameras: parseCameras(r?.meta.cameras, id).length > 0 };
};

// Чекпоинт у терминала: героиня возродится перед ним; лифт в пути записывается на этаже, куда едет.
function checkpointAt(g: Game, t: TerminalSpawn): void {
  const lifts = Object.fromEntries(g.lifts.map(l => [l.id, l.target ?? l.y]));
  saveCheckpoint(g.mission, { room: g.roomId, x: t.x - NINA.w / 2, bottom: t.bottom }, lifts);
  applyTerminals(g);
}

// Смерть: к последнему чекпоинту (до первого терминала — старт) с полной энергией.
// Предметы возвращаются на места, убитые враги — нет (g.killed не трогаем).
function respawn(g: Game): void {
  const p = restoreCheckpoint(g.mission);
  for (const l of g.lifts) {
    l.y = g.mission.checkpoint.lifts[l.id] ?? l.stops[0];
    l.target = null;
    l.rest = 0;
  }
  g.taken.clear();
  enterRoom(g, p.room);
  g.nina = createNina(p.x, p.bottom);
  g.heldId = null;
  g.anim = createAnimator();
}

// Конец миссии: при победе — выезд, затем итог (E — скопировать строку); прыжок — заново.
// Место 1 в таблице — звук record один раз, когда итог появляется.
function stepEnd(g: Game, it: Intent, dt: number): void {
  const t0 = g.endT;
  g.endT += dt;
  const shown = g.mission.result === 'won' ? MISSION.outroTime : g.mission.blown ? BOMB.blast : 0;
  if (g.endT < shown) return;
  if (t0 < shown && g.board?.place === 1) g.sfx.push('record');
  if (g.mission.result === 'won' && it.usePressed) g.clip = missionResult(g.mission).line;
  if (it.jumpPressed && g.endT >= shown + MISSION.restartDelay) Object.assign(g, g.withPrologue ? createPrologue(g.rooms, true) : createGame(g.rooms, g.start, g.missionId));
}

// Источник: касание — энергия больше не убывает до конца миссии; чекпоинт этого не откатывает.
function touchSource(g: Game, s: Point, nr: Rect, dt: number): void {
  if (!g.mission.secret && overlap({ x: s.x - 0.5, y: s.bottom - 2, w: 1, h: 2 }, nr)) {
    g.mission.secret = true;
    g.nina.immortal = true;
    g.sfx.push('source');
    spawnFloater(g.floaters, str().sourceFound, s.x, s.bottom - 3, 'enemy');
  }
  if (Math.random() < SOURCE.sparksPerSec * dt) {
    g.particles.push({ ch: Math.random() < 0.5 ? '.' : '*', x: s.x + (Math.random() - 0.5), y: s.bottom - 1, vx: (Math.random() - 0.5) * 0.6, vy: -SOURCE.sparkRise, t: 0, life: SOURCE.sparkLife, gravity: 0, size: 0.5, color: PAL.source });
  }
}

// Комната id, какой её видят физика, пули и лучи: закрытые двери — стена, открытые — проход; решётка текущей
// комнаты — стена в опущенных строках.
export const liveRoom = (g: Game, id = g.roomId): Room => solidRoom(g.rooms.get(id)!, g.mission.doorsOpen, id === g.roomId ? g.gate : 0);

// Камеры, тревога и решётка за шаг. Героиня в луче CAMERA.detect подряд — тревога CAMERA.alarm с: сирена раз
// в CAMERA.siren с от начала тревоги, решётки опускаются за CAMERA.gateTime и выталкивают героиню; после — поднимаются.
function stepAlarm(g: Game, dt: number): void {
  const t = elapsed(g.mission);
  const was = g.alarmT;
  g.alarmT = Math.max(0, g.alarmT - dt);
  if (stepCameras(g.cameras, liveRoom(g), t, g.nina.dead ? null : beamTarget(g.nina.body), dt)) g.alarmT = CAMERA.alarm;
  if (g.alarmT > 0) {
    const age = was === 0 ? 0 : g.alarmAge + dt;
    if (was === 0 || Math.floor(age / CAMERA.siren) !== Math.floor(g.alarmAge / CAMERA.siren)) g.sfx.push('alarm');
    g.alarmAge = age;
  } else g.alarmAge = 0;
  g.gate = g.alarmT > 0 ? Math.min(1, g.gate + dt / CAMERA.gateTime) : Math.max(0, g.gate - dt / CAMERA.gateTime);
  const room = liveRoom(g);
  for (const s of g.gates) pushFromGate(g.nina.body, g.nina.facing, s, gateRows(s, g.gate), room);
}

// E у закрытой двери: ключ её номера в руках — дверь открыта до конца миссии, ключ потрачен навсегда;
// без ключа — «НУЖЕН КЛЮЧ N». false — рядом закрытой двери нет.
function useDoor(g: Game): boolean {
  const d = g.doors.find(d => !g.mission.doorsOpen.has(doorId(g.roomId, d.n)) && near(g.nina, doorSpot(d)));
  if (!d) return false;
  if (keyDoor(g.nina.held) === d.n) {
    g.mission.doorsOpen.add(doorId(g.roomId, d.n));
    if (g.heldId) g.spent.add(g.heldId);
    g.nina.held = null;
    g.heldId = null;
    g.sfx.push('door');
  } else spawnFloater(g.floaters, str().needKey(d.n), d.x + 0.5, d.top - 0.5, 'blocked');
  return true;
}

// E у точки закладки: бомба в руках — заложена (отсчёт BOMB.fuse, жар у точки), предмет потрачен навсегда;
// без бомбы — «НУЖНА ВЗРЫВЧАТКА» над героиней. Уже заложена — ничего.
function plant(g: Game, site: Point): void {
  if (g.mission.fuse !== null) return;
  const b = g.nina.body;
  if (g.nina.held !== 'bomb') {
    spawnFloater(g.floaters, str().needBomb, b.x + b.w / 2, b.y - 0.6, 'blocked');
    return;
  }
  plantBomb(g.mission);
  if (g.heldId) g.spent.add(g.heldId);
  g.nina.held = null;
  g.heldId = null;
  g.fires.push(bombFire(site));
}

// Платформы лифтов в текущей комнате — опора сверху, как «=».
const liftTops = (g: Game): Rect[] => g.lifts.map(l => liftRect(l, g.roomId)).filter((r): r is Rect => r !== null);

const LIFT_EPS = 1e-3;

// Лифт, на платформе которого стоит героиня (центр над платформой, ноги на её верху).
function liftUnder(g: Game): Lift | undefined {
  const b = g.nina.body;
  if (g.nina.state !== 'ground') return undefined;
  return g.lifts.find(l => {
    const r = liftRect(l, g.roomId);
    return r !== null && overTop(b, r) && Math.abs(b.y + b.h - r.y) < LIFT_EPS;
  });
}

// Кого вызовет E: героиня стоит на этаже лифта у шахты (центр не дальше LIFT.callRange от её середины),
// лифта на этом этаже нет и он туда не едет. null — вызывать нечего.
export function liftCall(g: Game): { lift: Lift; stop: number } | null {
  const b = g.nina.body;
  if (g.nina.state !== 'ground') return null;
  for (const l of g.lifts) {
    const k = l.rooms.indexOf(g.roomId);
    if (k < 0 || Math.abs(b.x + b.w / 2 - (l.x + LIFT_W / 2)) > LIFT.callRange) continue;
    const stop = l.stops.find(s => Math.abs(s - k * ROOM_H - (b.y + b.h)) < LIFT_EPS);
    if (stop !== undefined && Math.abs(l.y - stop) > LIFT_EPS && l.target !== stop) return { lift: l, stop };
  }
  return null;
}

// E у шахты на этаже, где лифта нет, — вызвать его к себе.
function callLift(g: Game): void {
  const c = liftCall(g);
  if (c) c.lift.target = c.stop;
}

// Подсказка «E — ВЫЗВАТЬ ЛИФТ» над героиней: E сейчас вызовет лифт, и мир идёт (не пауза, не ЭВМ, не переход, не гибель, не конец).
export const liftHint = (g: Game): boolean =>
  !g.prologue && !g.paused && !g.screen && !g.transition && !g.nina.dead && !g.mission.result && liftCall(g) !== null;

// Лифты: удержание вверх/вниз на платформе — к следующему этажу. Платформа везёт стоящую героиню и лежащие
// предметы; поднимаясь, подхватывает падающую героиню, чьи ноги прошла.
function stepLifts(g: Game, it: Intent, dt: number): void {
  const under = liftUnder(g);
  if (under && under.target === null && under.rest === 0 && (it.up || it.down)) under.target = nextStop(under, it.up ? -1 : 1);
  const b = g.nina.body;
  for (const l of g.lifts) {
    const before = liftTop(l, g.roomId);
    const moving = l.target !== null;
    stepLift(l, dt);
    if (moving && l.target === null && before !== null) g.sfx.push('liftFloor'); // стук на этаже — если шахта в этой комнате
    const after = liftTop(l, g.roomId);
    if (before === null || after === null || after === before) continue;
    const feet = b.y + b.h;
    const over = overTop(b, { x: l.x, y: after, w: LIFT_W, h: 1 });
    const caught = after < before && g.nina.state === 'air' && feet > after && feet <= before + LIFT_EPS;
    if (over && (l === under || caught)) {
      b.y = after - b.h;
      b.x = Math.min(Math.max(b.x, l.x), l.x + LIFT_W - b.w); // тело целиком в шахте
    }
    for (const i of g.items) if (i.x >= l.x && i.x <= l.x + LIFT_W && Math.abs(i.bottom - before) < LIFT_EPS) i.bottom = after;
  }
}

// Рядом с объектом: стоит на его уровне, центр не дальше useRange.
const near = (n: Nina, p: Point) =>
  n.state === 'ground' && Math.abs(n.body.x + n.body.w / 2 - p.x) <= MISSION.useRange && Math.abs(n.body.y + n.body.h - p.bottom) < 0.5;

// Звуки тела за шаг героини: прыжок (скорость стала вверх), приземление по высоте падения, начало удара.
function bodySfx(g: Game, state0: NinaState, vy0: number, peak0: number, atk0: Attack | null): void {
  const n = g.nina, b = n.body;
  if (vy0 >= 0 && b.vy < 0) g.sfx.push('jump');
  if (state0 === 'air' && n.state === 'ground') {
    const fall = b.y - peak0;
    if (fall > NINA.safeFall) g.sfx.push('landHard');
    else if (fall >= SFX.landMin) g.sfx.push('land');
  }
  if (n.attack && n.attack !== atk0) g.sfx.push(n.attack.kind === 'punch' ? 'punch' : 'kick');
}

// Шаги: звук через каждые SFX.stride клеток пути по полу или воде, SFX.ladderStride — по лестнице; в воздухе счёт сначала.
function stepSfx(g: Game, y0: number, dt: number): void {
  const n = g.nina, b = n.body;
  if (n.state === 'ladder') {
    g.stepAcc += Math.abs(b.y - y0);
    if (g.stepAcc >= SFX.ladderStride) {
      g.stepAcc -= SFX.ladderStride;
      g.sfx.push('stepLadder');
    }
  } else if (n.state === 'ground' && Math.abs(b.vx) > ANIM.moveEps) {
    g.stepAcc += Math.abs(b.vx) * dt;
    if (g.stepAcc >= SFX.stride) {
      g.stepAcc -= SFX.stride;
      g.sfx.push(g.inWater ? 'stepWater' : 'stepFloor');
    }
  } else if (n.state === 'air') g.stepAcc = 0;
}

const bites = (dogs: Dog[]) => {
  let k = 0;
  for (const d of dogs) if (d.bit) k++;
  return k;
};

const HIT_SFX = { hit: 'hit', blocked: 'block', killed: 'kill', none: null } as const;

// Шаг игры и петли звука: гул лифта в пути и шипение струи звучат, пока мир идёт (не пауза, не экран ЭВМ,
// не конец миссии, не гибель). g мог смениться целиком («заново») — сравнение с тем, что звучало до шага.
// Мир получает намерение, прошедшее через кодек записи: реплей подаёт ровно те же числа (пауза — мимо записи).
export function stepGame(g: Game, it: Intent, dt: number): void {
  const lift0 = g.liftHum, jet0 = g.jetHiss;
  const code = encodeIntent(it);
  stepWorld(g, { ...decodeIntent(code), pausePressed: it.pausePressed }, code, dt);
  const live = !g.paused && !g.screen && !g.mission.result && !g.nina.dead;
  g.liftHum = live && g.lifts.some(l => l.target !== null && liftTop(l, g.roomId) !== null);
  g.jetHiss = live && g.flamers.some(f => flameRect(f) !== null);
  if (g.liftHum !== lift0) g.sfx.push(g.liftHum ? 'liftStart' : 'liftStop');
  if (g.jetHiss !== jet0) g.sfx.push(g.jetHiss ? 'jetOn' : 'jetOff');
}

// code — намерение шага для записи: дописывается, только если ввод принят (не стартовый экран, не пауза, нет итога).
function stepWorld(g: Game, it: Intent, code: number, dt: number): void {
  const p = g.prologue;
  if (p) {
    // После отцепления: вода — всплеск, опора под ногами — посадка и старт миссии.
    if (p.phase === 'fall' && !g.transition) {
      if (g.inWater) {
        p.phase = 'splash';
        p.t = 0;
        g.sfx.push('seaSplash');
      } else if (g.nina.state === 'ground') beginMission(g);
    }
    if (g.prologue && p.phase !== 'fall') {
      if (p.phase !== 'title') g.rec.push(code);
      stepPrologue(g, p, it, dt);
      return;
    }
  }
  if (g.mission.result) {
    stepEnd(g, it, dt);
    return;
  }
  if (!g.prologue) {
    g.seen.add(g.roomId);
    // Пауза (Esc/Start) — не в прологе и не на экране ЭВМ; нажатие, поставившее или снявшее паузу, в мир не уходит.
    if (it.pausePressed && !g.screen) {
      g.paused = !g.paused;
      return;
    }
    if (g.paused) return; // мир и таймер стоят
  }
  g.rec.push(code); // шаг пауза не съела — мир или экран ЭВМ принимают ввод
  const fuse0 = g.mission.fuse;
  if (!g.prologue) tickTimer(g.mission, dt); // таймер идёт всегда: в переходе, после гибели, на экране ЭВМ
  if (g.mission.blown && fuse0 !== null) g.sfx.push('explode');
  else if (fuse0 !== null && g.mission.fuse !== null && fuseTick(fuse0, g.mission.fuse)) g.sfx.push('fuse');
  if (g.mission.result) {
    g.screen = null; // таймер 0 — провал, мир стоит
    return;
  }
  if (g.screen) {
    const s = g.screen, t0 = s.t, sel0 = s.sel;
    const r = stepScreen(s, g.mission, it, dt);
    // Лог печатается — щелчок раз в SFX.typeEvery; меню — писк на шаг курсора и на выбор.
    if (t0 < MISSION.bootTime && Math.floor(s.t / SFX.typeEvery) > Math.floor(t0 / SFX.typeEvery)) g.sfx.push('type');
    if (s.sel !== sel0) g.sfx.push('menuMove');
    if (r !== 'stay') g.sfx.push('menuSelect');
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
    updateNina(g.nina, IDLE, liveRoom(g), dt, NINA, liftTops(g));
    updateAnimator(g.anim, g.nina, CLIPS, dt);
    if (it.jumpPressed && g.nina.deadT >= NINA.respawnDelay) respawn(g);
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
  let room = liveRoom(g);
  g.nina.immortal = g.mission.secret; // и после возрождения: новая Нина узнаёт об источнике здесь
  const e0 = g.nina.energy;
  const inv0 = g.nina.invulnT; // выросла за шаг — получен удар
  if (it.usePressed) {
    const t = g.terminals.find(t => near(g.nina, t));
    if (t) {
      g.screen = openScreen(t, controlsOf(g));
      checkpointAt(g, t);
      return;
    }
    if (g.panel && near(g.nina, g.panel)) {
      const msg = useSwitch(g.mission);
      g.sfx.push('switch');
      spawnFloater(g.floaters, msg, g.panel.x, g.panel.bottom - 2.5, g.mission.fenceOff ? 'enemy' : 'blocked');
    } else if (g.bike && near(g.nina, g.bike)) {
      if (startBike(g.mission)) {
        g.sfx.push('bike');
        return; // выезд — дальше stepEnd
      }
      if (g.mission.goal === 'bomb') {
        const b = g.nina.body;
        spawnFloater(g.floaters, str().plantFirst, b.x + b.w / 2, b.y - 0.6, 'blocked');
      } else {
        spawnFloater(g.floaters, str().fenceLive, g.bike.x, g.bike.bottom - 2.5, 'damage');
        g.sfx.push('zap');
        if (g.fence) for (let y = g.fence.top; y <= g.fence.bottom; y += 2) sparks(g.particles, g.fence.x + 0.5, y + 0.5, PAL.fireHot, 3);
      }
    } else if (g.bombSite && near(g.nina, g.bombSite)) plant(g, g.bombSite);
    else if (!useDoor(g)) callLift(g);
  }
  stepLifts(g, it, dt);
  const state0 = g.nina.state, vy0 = g.nina.body.vy, y0 = g.nina.body.y, peak0 = g.nina.peakY, atk0 = g.nina.attack;
  updateNina(g.nina, it, room, dt, NINA, liftTops(g));
  bodySfx(g, state0, vy0, peak0, atk0);
  touchHazards(g.nina, room, dt);
  const wet = touchesTile(g.nina, room, '~');
  const feet = g.nina.body;
  if (wet && !g.inWater) {
    splash(g.particles, feet.x + feet.w / 2, feet.y + feet.h - 0.3, FX.splashBurst);
    if (!g.prologue) g.sfx.push('splash'); // в прологе море — свой всплеск
  } else if (wet && Math.abs(feet.vx) > 1) {
    g.splashAcc += FX.splashPerSec * dt;
    if (g.splashAcc >= 1) {
      g.splashAcc -= 1;
      splash(g.particles, feet.x + feet.w / 2, feet.y + feet.h - 0.3, 1);
    }
  } else g.splashAcc = 0;
  g.inWater = wet;
  stepSfx(g, y0, dt);
  const { picked, dropped, thrown } = useThrowButton(g.nina, it, g.items);
  if (dropped && g.heldId) {
    // обмен: свой предмет — к ногам; после гибели или выхода из комнаты он снова на месте спавна
    g.taken.delete(g.heldId);
    g.items.push({ id: g.heldId, kind: dropped, x: g.nina.body.x + g.nina.body.w / 2, bottom: picked!.bottom });
  }
  if (picked) {
    g.taken.add(picked.id);
    g.heldId = picked.id;
    g.items = g.items.filter(i => i !== picked);
    g.sfx.push('pickup');
  }
  if (thrown) {
    g.projectiles.push(thrown);
    g.heldId = null;
  }
  // Ленты — в сумку касанием, руки остаются свободными.
  const nr = bodyRect(g.nina.body);
  for (const t of g.tapes) {
    if (!overlap(itemRect(t), nr)) continue;
    g.mission.tapes.add(t.id);
    g.sfx.push('tape');
    spawnFloater(g.floaters, str().tapeFloat(g.mission.tapes.size, MISSION.tapes), t.x, t.bottom - 1.5, 'enemy');
  }
  g.tapes = g.tapes.filter(t => !g.mission.tapes.has(t.id));
  if (g.source) touchSource(g, g.source, nr, dt);
  stepAlarm(g, dt);
  room = liveRoom(g);
  stepProjectiles(g.projectiles, room, dt);
  for (const a of g.androids) {
    const k = updateAndroid(a, g.nina, room, dt, g.alarmT > 0);
    if (k) g.projectiles.push(k);
  }
  for (const d of g.dogs) updateDog(d, g.nina, room, dt);
  for (const gd of g.guards) {
    const s0 = gd.state;
    const shot = updateGuard(gd, g.nina, room, dt, g.alarmT > 0);
    if (gd.state === 'aim' && s0 !== 'aim') g.sfx.push('aim');
    if (shot) {
      g.projectiles.push(shot);
      g.sfx.push('shot');
    }
  }
  const events: HitEvent[] = [];
  for (const id of resolveCombat(g.nina, g.androids, g.projectiles, room, events)) g.killed.add(id);
  const bit0 = bites(g.dogs);
  for (const id of resolveDogs(g.nina, g.dogs, g.projectiles, room, events)) g.killed.add(id);
  for (const id of resolveGuards(g.nina, g.guards, g.projectiles, room, events)) g.killed.add(id);
  if (bites(g.dogs) > bit0) g.sfx.push('bite');
  for (const f of g.flamers) {
    const warned = flamerPhase(f) === 'warn';
    stepFlamer(f, dt);
    if (!warned && flamerPhase(f) === 'warn') g.sfx.push('flamerWarn');
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
  const heat = g.fires.find(f => f.kind === 'bomb');
  if (heat && g.mission.fuse !== null) bombHeat(heat, 1 - g.mission.fuse / BOMB.fuse); // жар растёт к взрыву
  stepFires(g.fires, g.flamers, dt);
  if (g.nina.invulnT > inv0) {
    g.mission.hits++;
    g.sfx.push('hurt');
  }
  // Дым: над ямами — всегда, над концом струи — пока она горит.
  for (const fire of g.fires) {
    if (fire.kind !== 'jet') {
      const bomb = fire.kind === 'bomb';
      const width = bomb ? Math.max(g.mission.fuse === null ? 0 : 1 - g.mission.fuse / BOMB.fuse, 0.1) * fire.field.w / 2 : fire.field.w / 2;
      const left = bomb ? fire.x + (fire.field.w / 2 - width) / 2 : fire.x;
      const n = Math.floor(FX.smokePerSec * width * dt + Math.random());
      if (n) smoke(g.particles, left + Math.random() * width, fire.y - 1 - (bomb ? BOMB.heatRise : FIRE.pitRise), n);
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
    const gd = a ? undefined : g.guards.find(x => x.id === e.id);
    const d = a || gd ? undefined : g.dogs.find(x => x.id === e.id)!;
    const body = (a ?? gd ?? d)!.body;
    if (e.result === 'hit' || e.result === 'killed') g.mission.attacks++; // враг получил урон — для отметки «без боя»
    const text = e.result === 'killed' ? str().killed : e.result === 'blocked' ? str().blocked : '-1';
    const cx = body.x + body.w / 2;
    spawnFloater(g.floaters, text, cx, body.y - 0.6, e.result === 'blocked' ? 'blocked' : 'enemy');
    const s = HIT_SFX[e.result];
    if (s) g.sfx.push(s);
    sparks(g.particles, cx, body.y + 1, PAL.spark);
    if (e.result === 'killed') {
      if (a) {
        // андроид смотрит на ударившего — разлёт от него
        crumble(g.particles, figureGlyphs(simplePose(a.anim, CLIPS), cx, a.body.y + a.body.h, a.facing, PAL.android, false, '@'), -a.facing as 1 | -1);
        smoke(g.particles, cx, body.y + body.h / 2, FX.smokePuff);
        a.gone = true;
      } else if (gd) {
        crumble(g.particles, figureGlyphs(simplePose(gd.anim, CLIPS), cx, gd.body.y + gd.body.h, gd.facing, PAL.guard, false, 'o'), -gd.facing as 1 | -1);
        smoke(g.particles, cx, body.y + body.h / 2, FX.smokePuff);
        gd.gone = true;
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
  for (const gd of g.guards) {
    const { name, advance } = guardClip(gd, dt, CLIPS);
    playClip(gd.anim, name, advance, CLIPS);
  }
  g.floaters = stepFloaters(g.floaters, dt);
  g.particles = stepParticles(g.particles, dt);
  if (g.nina.dead) g.sfx.push('death'); // гибель — в этом шаге: мёртвая героиня сюда больше не доходит
  const ex = exitFor(g.nina.body, room, id => (g.rooms.has(id) ? liveRoom(g, id) : undefined));
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
