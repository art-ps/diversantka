import { MISSION, NINA, ROOM_H } from '../config';
import { doorsOf, keyDoor } from '../sim/doors';
import { LIFT_W, shaftRooms } from '../sim/lift';
import { parseRoom, tileAt, validateWorld, type Room } from './room';
import { parseAmbient, parseCameras, parseEnemies, parseFence, parseItems, parseLift, parsePoints, parseTerminals } from './spawns';

const files = import.meta.glob('./rooms/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function loadWorld(): Map<string, Room> {
  const rooms = new Map<string, Room>();
  for (const [path, text] of Object.entries(files)) {
    const room = parseRoom(text, path);
    parseItems(room.meta.items, path);
    parseEnemies(room.meta.enemies, path);
    parseCameras(room.meta.cameras, path);
    if (rooms.has(room.id)) throw new Error(`${path}: повтор id ${room.id}`);
    rooms.set(room.id, room);
  }
  const errors = [...validateWorld(rooms), ...validateMission(rooms), ...validateLifts(rooms), ...validateAmbient(rooms), ...validateDoors(rooms)];
  if (errors.length) throw new Error(errors.join('\n'));
  return rooms;
}

// Миссия на карте: 6 лент, одна главная ЭВМ, один щиток, один мотоцикл, один источник; терминалы гасят существующие комнаты.
export function validateMission(rooms: Map<string, Room>): string[] {
  const errors: string[] = [];
  let tapes = 0, mains = 0, panels = 0, bikes = 0, sources = 0;
  for (const r of rooms.values()) {
    tapes += parsePoints(r.meta.tapes, r.id, 'ленты').length;
    panels += parsePoints(r.meta.switch, r.id, 'щитка').length;
    bikes += parsePoints(r.meta.bike, r.id, 'мотоцикла').length;
    sources += parsePoints(r.meta.source, r.id, 'источника').length;
    parseFence(r.meta.fence, r.id);
    for (const t of parseTerminals(r.meta.terminals, r.id)) {
      if (t.main) mains++;
      for (const c of t.controls) if (!rooms.has(c)) errors.push(`${r.id}: терминал гасит огнемёты несуществующей комнаты ${c}`);
    }
  }
  if (tapes !== MISSION.tapes) errors.push(`лент на карте ${tapes}, нужно ${MISSION.tapes}`);
  if (mains !== 1) errors.push(`главных ЭВМ на карте ${mains}, нужна одна`);
  if (panels !== 1) errors.push(`щитков на карте ${panels}, нужен один`);
  if (bikes !== 1) errors.push(`мотоциклов на карте ${bikes}, нужен один`);
  if (sources !== 1) errors.push(`источников на карте ${sources}, нужен один`);
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
