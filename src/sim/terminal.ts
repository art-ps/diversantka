import { MISSION } from '../config';
import { str } from '../i18n';
import type { Intent } from '../input/intent';
import type { TerminalSpawn } from '../world/spawns';
import { enterTapes, type Mission } from './mission';

export interface Screen { term: TerminalSpawn; t: number; sel: number; msg: string }

export type MenuItem =
  | { label: string; act: 'flamer'; room: string }
  | { label: string; act: 'tapes' }
  | { label: string; act: 'exit' };

// Видимая часть лога загрузки ЭВМ (str().bootLog, по мотивам boot-log из ascii.rest) через t секунд:
// символы появляются равномерно, весь лог — за MISSION.bootTime.
export function bootLines(t: number): string[] {
  const log = str().bootLog;
  const total = log.reduce((n, l) => n + l.length, 0);
  let left = Math.floor((Math.min(t, MISSION.bootTime) / MISSION.bootTime) * total);
  const out: string[] = [];
  for (const l of log) {
    if (left <= 0) break;
    out.push(l.slice(0, left));
    left -= l.length;
  }
  return out;
}

export function menuItems(term: TerminalSpawn): MenuItem[] {
  return [
    ...term.controls.map(room => ({ label: str().menuFlamer(room), act: 'flamer' as const, room })),
    ...(term.main ? [{ label: str().menuTapes, act: 'tapes' as const }] : []),
    { label: str().menuExit, act: 'exit' as const },
  ];
}

export const openScreen = (term: TerminalSpawn): Screen => ({ term, t: 0, sel: 0, msg: '' });

// Шаг экрана ЭВМ. 'changed' — миссия изменилась (записать чекпоинт), 'close' — выход в мир.
export function stepScreen(s: Screen, m: Mission, it: Intent, dt: number): 'stay' | 'changed' | 'close' {
  s.t += dt;
  if (s.t < MISSION.bootTime) return 'stay'; // лог печатается — ввод не слушается
  const items = menuItems(s.term);
  if (it.upPressed) s.sel = (s.sel + items.length - 1) % items.length;
  if (it.downPressed) s.sel = (s.sel + 1) % items.length;
  if (!it.jumpPressed && !it.usePressed) return 'stay';
  const item = items[s.sel];
  if (item.act === 'exit') return 'close';
  if (item.act === 'tapes') s.msg = enterTapes(m);
  else {
    m.flamersOff.add(item.room);
    s.msg = str().flamerOff(item.room);
  }
  return 'changed';
}
