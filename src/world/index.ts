import { MISSION, NINA, ROOM_H } from '../config';
import { isOpaque } from '../sim/camera';
import { DOOR_TILES, doorsOf, gatesOf, keyDoor } from '../sim/doors';
import { LIFT_W, shaftRooms } from '../sim/lift';
import type { Mission, Spot } from '../sim/mission';
import { parseRoom, tileAt, validateWorld, type Room } from './room';
import { parseAmbient, parseCameras, parseEnemies, parseFence, parseItems, parseLift, parsePoints, parseTerminals } from './spawns';

// Наборы комнат: 1 — база НИИ (первая миссия), 2 — подземный бункер (вторая).
const FILES: Record<MissionNo, Record<string, string>> = {
  1: import.meta.glob('./rooms/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>,
  2: import.meta.glob('./rooms2/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>,
};

export type MissionNo = 1 | 2;

// Старт второй миссии: въезд, справа от мотоцикла (x — левый край тела, как в createNina).
export const BUNKER_START: Spot = { room: 'gate', x: 9, bottom: 22 };

export function loadWorld(mission: MissionNo = 1): Map<string, Room> {
  const rooms = new Map<string, Room>();
  for (const [path, text] of Object.entries(FILES[mission])) {
    const room = parseRoom(text, path);
    parseItems(room.meta.items, path);
    parseEnemies(room.meta.enemies, path);
    parseCameras(room.meta.cameras, path);
    if (rooms.has(room.id)) throw new Error(`${path}: повтор id ${room.id}`);
    rooms.set(room.id, room);
  }
  const goal = mission === 1 ? 'tapes' : 'bomb';
  const errors = [
    ...validateWorld(rooms), ...validateMission(rooms, goal), ...validateLifts(rooms), ...validateAmbient(rooms), ...validateDoors(rooms),
    ...validateCameras(rooms), ...validateGates(rooms),
  ];
  if (errors.length) throw new Error(errors.join('\n'));
  return rooms;
}

// Миссия на карте. tapes (первая): 6 лент, одна главная ЭВМ, один щиток, один мотоцикл, один источник.
// bomb (вторая): одна точка закладки, одна бомба, один мотоцикл — в стартовой комнате start. У обеих терминалы гасят
// существующие комнаты.
export function validateMission(rooms: Map<string, Room>, goal: Mission['goal'] = 'tapes', start = BUNKER_START.room): string[] {
  if (goal === 'bomb') return validateBomb(rooms, start);
  const errors = validateControls(rooms);
  let tapes = 0, mains = 0, panels = 0, bikes = 0, sources = 0;
  for (const r of rooms.values()) {
    tapes += parsePoints(r.meta.tapes, r.id, 'ленты').length;
    panels += parsePoints(r.meta.switch, r.id, 'щитка').length;
    bikes += parsePoints(r.meta.bike, r.id, 'мотоцикла').length;
    sources += parsePoints(r.meta.source, r.id, 'источника').length;
    parseFence(r.meta.fence, r.id);
    for (const t of parseTerminals(r.meta.terminals, r.id)) if (t.main) mains++;
  }
  if (tapes !== MISSION.tapes) errors.push(`лент на карте ${tapes}, нужно ${MISSION.tapes}`);
  if (mains !== 1) errors.push(`главных ЭВМ на карте ${mains}, нужна одна`);
  if (panels !== 1) errors.push(`щитков на карте ${panels}, нужен один`);
  if (bikes !== 1) errors.push(`мотоциклов на карте ${bikes}, нужен один`);
  if (sources !== 1) errors.push(`источников на карте ${sources}, нужен один`);
  return errors;
}

// Терминал гасит огнемёты и камеры только существующих комнат.
function validateControls(rooms: Map<string, Room>): string[] {
  const errors: string[] = [];
  for (const r of rooms.values()) {
    for (const t of parseTerminals(r.meta.terminals, r.id)) {
      for (const c of t.controls) if (!rooms.has(c)) errors.push(`${r.id}: терминал гасит огнемёты несуществующей комнаты ${c}`);
    }
  }
  return errors;
}

// Вторая миссия: бомбу берут в сейфе, закладывают в точке «bomb:», уезжают на мотоцикле из стартовой комнаты.
function validateBomb(rooms: Map<string, Room>, start: string): string[] {
  const errors = validateControls(rooms);
  let sites = 0, bombs = 0;
  const bikes: string[] = [];
  for (const r of rooms.values()) {
    sites += parsePoints(r.meta.bomb, r.id, 'точки закладки').length;
    bombs += parseItems(r.meta.items, r.id).filter(i => i.kind === 'bomb').length;
    bikes.push(...parsePoints(r.meta.bike, r.id, 'мотоцикла').map(() => r.id));
  }
  if (sites !== 1) errors.push(`точек закладки на карте ${sites}, нужна одна`);
  if (bombs !== 1) errors.push(`бомб на карте ${bombs}, нужна одна`);
  if (bikes.length !== 1) errors.push(`мотоциклов на карте ${bikes.length}, нужен один`);
  else if (bikes[0] !== start) errors.push(`мотоцикл в ${bikes[0]}, а нужен в стартовой комнате ${start}`);
  return errors;
}

// Лифты: шахта идёт вниз по выходам down; от головы героини над верхним этажом до нижнего этажа — только фон «.».
export function validateLifts(rooms: Map<string, Room>): string[] {
  const errors: string[] = [];
  for (const r of rooms.values()) {
    const s = parseLift(r.meta.lift, r.id);
    if (!s) continue;
    const top = s.stops[0], bottom = s.stops[s.stops.length - 1];
    const shaft = shaftRooms(rooms, r.id, bottom);
    if (!shaft) {
      errors.push(`${r.id}: шахта лифта уходит вниз в комнату, которой нет`);
      continue;
    }
    if (top < NINA.h) {
      errors.push(`${r.id}: над верхним этажом лифта нет места для героини`);
      continue;
    }
    for (let y = top - NINA.h; y < bottom; y++) {
      const room = rooms.get(shaft[Math.floor(y / ROOM_H)])!;
      for (let c = s.x; c < s.x + LIFT_W; c++) {
        if (tileAt(room, c, y % ROOM_H) !== '.') errors.push(`${room.id}: в шахте лифта ${r.id} клетка ${c},${y % ROOM_H} не пустая`);
      }
    }
  }
  return errors;
}

// Двери и ключи: на номер N на всей карте — ровно одна дверь и ровно один ключ, либо ни того ни другого.
// Дверь закрывает проём целиком: над ней стена, под ней пол («#» или «=»).
export function validateDoors(rooms: Map<string, Room>): string[] {
  const errors: string[] = [];
  const doors = [0, 0, 0, 0], keys = [0, 0, 0, 0];
  for (const r of rooms.values()) {
    for (const d of doorsOf(r)) {
      doors[d.n]++;
      const below = r.tiles[d.bottom]?.[d.x];
      if (r.tiles[d.top - 1]?.[d.x] !== '#' || (below !== '#' && below !== '=')) errors.push(`${r.id}: дверь ${d.n} не закрывает проём от пола до стены`);
    }
    for (const i of parseItems(r.meta.items, r.id)) {
      const n = keyDoor(i.kind);
      if (n) keys[n]++;
    }
  }
  for (const n of [1, 2, 3]) {
    if (doors[n] > 1) errors.push(`дверей ${n} на карте ${doors[n]}, нужна одна`);
    if (keys[n] > 1) errors.push(`ключей ${n} на карте ${keys[n]}, нужен один`);
    if (doors[n] && !keys[n]) errors.push(`у двери ${n} нет ключа`);
    if (keys[n] && !doors[n]) errors.push(`ключ ${n} без двери`);
  }
  return errors;
}

// Камера висит в свободной клетке: в «#», «S» или «=» её луч упёрся бы сам в себя; в двери или решётке — то же,
// стоит двери закрыться или решётке опуститься.
export function validateCameras(rooms: Map<string, Room>): string[] {
  const errors: string[] = [];
  for (const r of rooms.values()) {
    for (const c of parseCameras(r.meta.cameras, r.id)) {
      const t = tileAt(r, c.x, c.y);
      if (isOpaque(t)) errors.push(`${r.id}: камера ${c.x},${c.y} в стене`);
      else if (DOOR_TILES.includes(t) || t === 'A') errors.push(`${r.id}: камера ${c.x},${c.y} в двери или решётке`);
    }
  }
  return errors;
}

// Решётка выталкивает только героиню: враг, чей участок с телом (клетка в обе стороны) заходит под решётку на высоте
// его роста, оказался бы в стене.
export function validateGates(rooms: Map<string, Room>): string[] {
  const errors: string[] = [];
  for (const r of rooms.values()) {
    const gates = gatesOf(r);
    for (const e of parseEnemies(r.meta.enemies, r.id)) {
      if (e.kind === 'flamer') continue;
      const [a, b] = e.patrol;
      for (const s of gates) {
        if (s.x >= Math.floor(a - 1) && s.x <= Math.ceil(b + 1) && s.top < e.bottom && s.bottom > e.bottom - 4) {
          errors.push(`${r.id}: ${e.kind} ${a}..${b} ходит под решёткой ${s.x}`);
        }
      }
    }
  }
  return errors;
}

// Звуковой фон: у каждой комнаты карты — «ambient:» из AMBIENTS.
export function validateAmbient(rooms: Map<string, Room>): string[] {
  const errors: string[] = [];
  for (const r of rooms.values()) {
    try {
      if (!parseAmbient(r.meta.ambient, r.id)) errors.push(`${r.id}: нет фона «ambient:»`);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return errors;
}
