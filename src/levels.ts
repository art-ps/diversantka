import { generateLevel } from './gen/level';
import { MISSIONS, type MissionDef, type MissionNo } from './missions';
import { loadWorld } from './world';
import type { Room } from './world/room';

// Миссии по номеру: 1–2 — ручные (src/missions.ts, src/world/rooms*), с 3-й — сгенерированные уровни (src/gen).
// Набор комнат и описание считаются один раз за сессию: переходы и «заново» их не пересобирают.
const worlds = new Map<MissionNo, Map<string, Room>>();
const defs = new Map<MissionNo, MissionDef>();

const hand = (n: MissionNo): n is 1 | 2 => n === 1 || n === 2;

function load(n: MissionNo): void {
  if (worlds.has(n)) return;
  if (hand(n)) {
    worlds.set(n, loadWorld(n));
    defs.set(n, MISSIONS[n]);
    return;
  }
  const lv = generateLevel(n);
  worlds.set(n, lv.rooms);
  defs.set(n, lv.def);
}

export function missionDef(n: MissionNo): MissionDef {
  if (hand(n)) return MISSIONS[n];
  load(n);
  return defs.get(n)!;
}

export function worldOf(n: MissionNo): Map<string, Room> {
  load(n);
  return worlds.get(n)!;
}
