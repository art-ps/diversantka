import { DIRS, type Dir, type Room } from './room';
import { parsePoints, parseTerminals } from './spawns';

export interface Cell { x: number; y: number }
const STEP: Record<Dir, Cell> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } };

// Раскладка карты: клетки комнат по выходам, обход в ширину от root. Комната, чья клетка уже занята, на карту
// не встаёт (если другой сосед не поставит её на свободную); conflicts — такие комнаты и выходы между
// поставленными комнатами, которые с раскладкой не сходятся.
export function layoutMap(rooms: Map<string, Room>, root: string): { pos: Map<string, Cell>; conflicts: string[] } {
  const pos = new Map<string, Cell>([[root, { x: 0, y: 0 }]]);
  const owner = new Map<string, string>([['0,0', root]]);
  const clash = new Map<string, string>(); // комната → кто занял её клетку
  const queue = [root];
  while (queue.length) {
    const id = queue.shift()!;
    const p = pos.get(id)!;
    for (const d of DIRS) {
      const to = rooms.get(id)?.exits[d];
      if (!to || pos.has(to) || !rooms.has(to)) continue;
      const c = { x: p.x + STEP[d].x, y: p.y + STEP[d].y };
      const key = `${c.x},${c.y}`;
      const other = owner.get(key);
      if (other) {
        clash.set(to, other);
        continue;
      }
      pos.set(to, c);
      owner.set(key, to);
      queue.push(to);
    }
  }
  const conflicts = [...clash].filter(([id]) => !pos.has(id)).map(([id, other]) => `${id}: клетка карты занята комнатой ${other}`);
  for (const [id, p] of pos) {
    for (const d of DIRS) {
      const to = rooms.get(id)!.exits[d];
      const q = to ? pos.get(to) : undefined;
      if (q && (q.x !== p.x + STEP[d].x || q.y !== p.y + STEP[d].y)) conflicts.push(`${id}: выход ${d} → ${to} не сходится с картой`);
    }
  }
  return { pos, conflicts };
}

export type MapIcon = 'terminal' | 'main' | 'switch' | 'bike' | 'tape';

// Значки комнаты на карте: терминалы, главная ЭВМ, щиток, мотоцикл (гараж), неподобранные ленты (id — как в enterRoom).
export function mapIcons(room: Room, taken: ReadonlySet<string>): MapIcon[] {
  const out: MapIcon[] = parseTerminals(room.meta.terminals, room.id).map(t => (t.main ? 'main' : 'terminal'));
  if (parsePoints(room.meta.switch, room.id, 'щитка').length) out.push('switch');
  if (parsePoints(room.meta.bike, room.id, 'мотоцикла').length) out.push('bike');
  parsePoints(room.meta.tapes, room.id, 'ленты').forEach((_, i) => {
    if (!taken.has(`${room.id}#t${i}`)) out.push('tape');
  });
  return out;
}
