import { MISSION } from '../config';
import { str } from '../i18n';
import type { Intent } from '../input/intent';
import type { TerminalSpawn } from '../world/spawns';
import { enterTapes, type Mission } from './mission';

// items — меню, собранное при открытии.
export interface Screen { term: TerminalSpawn; t: number; sel: number; msg: string; items: MenuItem[] }

export type MenuItem =
  | { label: string; act: 'flamer'; room: string }
  | { label: string; act: 'camera'; room: string }
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

// Что стоит в комнате из controls: огнемёты, камеры. Без сведений о комнатах — только огнемёты (первая миссия).
export type Controls = (room: string) => { flamers: boolean; cameras: boolean };
const FLAMERS_ONLY: Controls = () => ({ flamers: true, cameras: false });

// Пункты на каждую комнату controls: «ОТКЛ. ОГНЕМЁТ», если там огнемёты, «ОТКЛ. КАМЕРЫ», если камеры.
export function menuItems(term: TerminalSpawn, has: Controls = FLAMERS_ONLY): MenuItem[] {
  return [
    ...term.controls.flatMap(room => [
      ...(has(room).flamers ? [{ label: str().menuFlamer(room), act: 'flamer' as const, room }] : []),
      ...(has(room).cameras ? [{ label: str().menuCamera(room), act: 'camera' as const, room }] : []),
    ]),
    ...(term.main ? [{ label: str().menuTapes, act: 'tapes' as const }] : []),
    { label: str().menuExit, act: 'exit' as const },
  ];
}

export const openScreen = (term: TerminalSpawn, has?: Controls): Screen => ({ term, t: 0, sel: 0, msg: '', items: menuItems(term, has) });

// Шаг экрана ЭВМ. 'changed' — миссия изменилась (записать чекпоинт), 'close' — выход в мир.
export function stepScreen(s: Screen, m: Mission, it: Intent, dt: number): 'stay' | 'changed' | 'close' {
  s.t += dt;
  if (s.t < MISSION.bootTime) return 'stay'; // лог печатается — ввод не слушается
  const items = s.items;
  if (it.upPressed) s.sel = (s.sel + items.length - 1) % items.length;
  if (it.downPressed) s.sel = (s.sel + 1) % items.length;
  if (!it.jumpPressed && !it.usePressed) return 'stay';
  const item = items[s.sel];
  if (item.act === 'exit') return 'close';
  if (item.act === 'tapes') s.msg = enterTapes(m);
  else if (item.act === 'camera') {
    m.camerasOff.add(item.room);
    s.msg = str().cameraOff(item.room);
  } else {
    m.flamersOff.add(item.room);
    s.msg = str().flamerOff(item.room);
  }
  return 'changed';
}
