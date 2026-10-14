import { MISSION, NINA, PROLOGUE } from './config';
import { gliderAt, ROUTE } from './sim/glider';
import type { Mission, Spot } from './sim/mission';

// Номер миссии: 1 — база НИИ (ленты), 2 — подземный бункер (взрывчатка).
export type MissionNo = 1 | 2;

// Описание миссии: набор комнат (src/world/rooms, rooms2), старт (x — левый край тела, как в createNina), таймер, с, и цель —
// условие выезда на мотоцикле. Старт первой — героиня под дельтапланом в начале пролога; место посадки станет чекпоинтом.
export interface MissionDef { rooms: MissionNo; start: Spot; time: number; goal: Mission['goal'] }

const glider = gliderAt(PROLOGUE.startD);

export const MISSIONS: Record<MissionNo, MissionDef> = {
  1: { rooms: 1, start: { room: ROUTE[glider.screen], x: glider.x - NINA.w / 2, bottom: glider.bottom }, time: MISSION.time, goal: 'tapes' },
  2: { rooms: 2, start: { room: 'gate', x: 9, bottom: 22 }, time: 12 * 60, goal: 'bomb' },
};
