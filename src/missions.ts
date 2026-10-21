import { MISSION, NINA, PROLOGUE } from './config';
import { gliderAt, ROUTE } from './sim/glider';
import type { Mission, Spot } from './sim/mission';

// Номер миссии: 1 — база НИИ (ленты), 2 — подземный бункер (взрывчатка), с 3-й — сгенерированные уровни (src/levels.ts).
export type MissionNo = number;
// Ручные миссии — наборы комнат src/world/rooms, rooms2.
export type HandMission = 1 | 2;

// Описание миссии: старт (x — левый край тела, как в createNina), таймер, с, цель — условие выезда на мотоцикле,
// лент на карте (0 — у цели bomb). Старт первой — героиня под дельтапланом в начале пролога; место посадки станет чекпоинтом.
export interface MissionDef { start: Spot; time: number; goal: Mission['goal']; tapes: number }

const glider = gliderAt(PROLOGUE.startD);

export const MISSIONS: Record<HandMission, MissionDef> = {
  1: { start: { room: ROUTE[glider.screen], x: glider.x - NINA.w / 2, bottom: glider.bottom }, time: MISSION.time, goal: 'tapes', tapes: MISSION.tapes },
  2: { start: { room: 'gate', x: 9, bottom: 22 }, time: 12 * 60, goal: 'bomb', tapes: 0 },
};
