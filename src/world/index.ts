import { MISSION } from '../config';
import { parseRoom, validateWorld, type Room } from './room';
import { parseEnemies, parseFence, parseItems, parsePoints, parseTerminals } from './spawns';

const files = import.meta.glob('./rooms/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function loadWorld(): Map<string, Room> {
  const rooms = new Map<string, Room>();
  for (const [path, text] of Object.entries(files)) {
    const room = parseRoom(text, path);
    parseItems(room.meta.items, path);
    parseEnemies(room.meta.enemies, path);
    if (rooms.has(room.id)) throw new Error(`${path}: повтор id ${room.id}`);
    rooms.set(room.id, room);
  }
  const errors = [...validateWorld(rooms), ...validateMission(rooms)];
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
