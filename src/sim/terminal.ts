import { MISSION } from '../config';
import type { Intent } from '../input/intent';
import type { TerminalSpawn } from '../world/spawns';
import { enterTapes, type Mission } from './mission';

export interface Screen { term: TerminalSpawn; t: number; sel: number; msg: string }

export type MenuItem =
  | { label: string; act: 'flamer'; room: string }
  | { label: string; act: 'tapes' }
  | { label: string; act: 'exit' };

// Лог загрузки ЭВМ (по мотивам boot-log из ascii.rest), печатается за MISSION.bootTime.
export const BOOT_LOG = [
  'НИИ-7 · ЭВМ СЕРИИ 2 · МОНИТОР В3.1',
  'ТЕСТ ОЗУ ............. 64К ОК',
  'ЛЕНТОПРОТЯЖКА ........... ОК',
  'СВЯЗЬ С ПУЛЬТОМ ......... ОК',
  'ЧЕКПОИНТ ЗАПИСАН',
];

// Видимая часть лога через t секунд: символы появляются равномерно.
export function bootLines(t: number): string[] {
  const total = BOOT_LOG.reduce((n, l) => n + l.length, 0);
  let left = Math.floor((Math.min(t, MISSION.bootTime) / MISSION.bootTime) * total);
  const out: string[] = [];
  for (const l of BOOT_LOG) {
    if (left <= 0) break;
    out.push(l.slice(0, left));
    left -= l.length;
  }
  return out;
}

export function menuItems(term: TerminalSpawn): MenuItem[] {
  return [
    ...term.controls.map(room => ({ label: `ОТКЛ. ОГНЕМЁТ ${room}`, act: 'flamer' as const, room })),
    ...(term.main ? [{ label: 'ВВЕСТИ ЛЕНТЫ', act: 'tapes' as const }] : []),
    { label: 'ВЫХОД', act: 'exit' as const },
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
    s.msg = `ОГНЕМЁТ ${item.room} ОТКЛЮЧЁН`;
  }
  return 'changed';
}
