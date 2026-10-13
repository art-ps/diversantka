import { MISSION } from '../config';
import { str, type Mark } from '../i18n';

// x — левый край тела, как в createNina.
export interface Spot { room: string; x: number; bottom: number }

export interface Checkpoint extends Spot {
  timeLeft: number;
  tapes: string[];
  tapesIn: boolean;
  fenceOff: boolean;
  flamersOff: string[];
  camerasOff: string[];
  lifts: Record<string, number>; // id лифта → этаж платформы; лифта нет в записи — на верхнем этаже
}

export interface Mission {
  timeLeft: number; // с
  tapes: Set<string>; // id подобранных лент
  tapesIn: boolean; // ленты введены в главную ЭВМ
  fenceOff: boolean;
  flamersOff: Set<string>; // комнаты, где огнемёты выключены с терминала
  camerasOff: Set<string>; // комнаты, где камеры выключены с терминала
  hits: number; // полученные удары за миссию; чекпоинт их не откатывает
  secret: boolean; // источник найден; чекпоинт его не откатывает
  attacks: number; // попадания героини по врагам (рука, нога, прыжок, бросок); чекпоинт не откатывает
  doorsOpen: Set<string>; // открытые двери «комната#N» (src/sim/doors.ts); гибель их не закрывает — чекпоинт не откатывает
  result: 'won' | 'failed' | null;
  checkpoint: Checkpoint;
}

// seconds — время миссии числом (для таблицы рекордов), date — день прохождения «ГГГГ-ММ-ДД» по местному времени.
export interface MissionResult { time: string; tapes: string; hits: number; secret: boolean; line: string; seconds: number; attacks: number; date: string }

export function createMission(start: Spot): Mission {
  return {
    timeLeft: MISSION.time, tapes: new Set(), tapesIn: false, fenceOff: false, flamersOff: new Set(), camerasOff: new Set(), hits: 0, secret: false, attacks: 0, doorsOpen: new Set(), result: null,
    checkpoint: { ...start, timeLeft: MISSION.time, tapes: [], tapesIn: false, fenceOff: false, flamersOff: [], camerasOff: [], lifts: {} },
  };
}

export function saveCheckpoint(m: Mission, at: Spot, lifts: Record<string, number> = {}): void {
  m.checkpoint = { ...at, timeLeft: m.timeLeft, tapes: [...m.tapes], tapesIn: m.tapesIn, fenceOff: m.fenceOff, flamersOff: [...m.flamersOff], camerasOff: [...m.camerasOff], lifts: { ...lifts } };
}

// Состояние миссии — как в чекпоинте; возвращает место возрождения.
export function restoreCheckpoint(m: Mission): Spot {
  const c = m.checkpoint;
  m.timeLeft = c.timeLeft;
  m.tapes = new Set(c.tapes);
  m.tapesIn = c.tapesIn;
  m.fenceOff = c.fenceOff;
  m.flamersOff = new Set(c.flamersOff);
  m.camerasOff = new Set(c.camerasOff);
  return { room: c.room, x: c.x, bottom: c.bottom };
}

// Секунд с начала миссии — часы камер и итог.
export const elapsed = (m: Mission): number => MISSION.time - m.timeLeft;

export function tickTimer(m: Mission, dt: number): void {
  if (m.result) return;
  m.timeLeft = Math.max(0, m.timeLeft - dt);
  if (m.timeLeft === 0) m.result = 'failed';
}

// Главная ЭВМ: принимает только все ленты сразу.
export function enterTapes(m: Mission): string {
  if (m.tapes.size < MISSION.tapes) return str().notEnoughTapes(m.tapes.size, MISSION.tapes);
  m.tapesIn = true;
  return str().tapesIn;
}

export function useSwitch(m: Mission): string {
  if (!m.tapesIn) return str().accessDenied;
  m.fenceOff = true;
  return str().fenceOff;
}

// Мотоцикл: при включённом заборе не едет; поехал — миссия выполнена, таймер встал.
export function startBike(m: Mission): boolean {
  if (!m.fenceOff || m.result) return false;
  m.result = 'won';
  return true;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
export function formatTime(sec: number): string {
  const s = Math.ceil(Math.max(0, sec));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

// Отметки результата по порядку показа: без урона, без боя, источник.
export function marksOf(r: { hits: number; attacks: number; secret: boolean }): Mark[] {
  const out: Mark[] = [];
  if (r.hits === 0) out.push('noDamage');
  if (r.attacks === 0) out.push('noFight');
  if (r.secret) out.push('source');
  return out;
}

export const isoDay = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function missionResult(m: Mission, now: Date = new Date()): MissionResult {
  const seconds = elapsed(m);
  const time = formatTime(seconds);
  const tapes = `${m.tapes.size}/${MISSION.tapes}`;
  const line = str().resultLine(time, tapes, m.hits, marksOf(m));
  return { time, tapes, hits: m.hits, secret: m.secret, line, seconds, attacks: m.attacks, date: isoDay(now) };
}
