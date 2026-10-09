import { DT, NINA, ROOM_H, ROOM_W } from '../src/config';
import { LIFT_W, shaftRooms } from '../src/sim/lift';
import type { Spot } from '../src/sim/mission';
import type { Dir, Room } from '../src/world/room';
import { parseLift, parsePoints, parseTerminals } from '../src/world/spawns';

// Достижимость для тестов карты (приёмка №3): поиск в ширину по клеткам. Узел «стоит» — тело в колонках c, c+1
// (центр x = c+1), ноги на строке r (низ тела = r); узел «на лестнице» — центр x = L+0.5. Переходы — шаг, падение,
// прыжок по настоящей дуге из NINA, лестницы, лифты, выходы комнат. Всё с запасом: шипы `^` не проходимы,
// падение — не больше FALL_MAX клеток, прыжок — без зацепа за лестницу в воздухе.

const H = Math.ceil(NINA.h);
const E = 1e-6;
// Падение снимает не больше половины энергии.
export const FALL_MAX = NINA.safeFall + Math.floor(NINA.energyMax / 2 / NINA.fallDamagePerCell);

export interface Target { what: string; room: string; x: number; bottom: number }

// Цели миссии: 6 лент, главная ЭВМ, щиток, гараж (мотоцикл), источник.
export function missionTargets(rooms: Map<string, Room>): Target[] {
  const out: Target[] = [];
  for (const r of rooms.values()) {
    parsePoints(r.meta.tapes, r.id, 'ленты').forEach((p, i) => out.push({ what: `лента ${r.id}#t${i}`, room: r.id, ...p }));
    for (const t of parseTerminals(r.meta.terminals, r.id)) if (t.main) out.push({ what: 'ЭВМ', room: r.id, x: t.x, bottom: t.bottom });
    for (const p of parsePoints(r.meta.switch, r.id, 'щитка')) out.push({ what: 'щиток', room: r.id, ...p });
    for (const p of parsePoints(r.meta.bike, r.id, 'мотоцикла')) out.push({ what: 'гараж', room: r.id, ...p });
    for (const p of parsePoints(r.meta.source, r.id, 'источника')) out.push({ what: 'источник', room: r.id, ...p });
  }
  return out;
}

interface Node { id: string; c: number; r: number }

export function reachableNodes(rooms: Map<string, Room>, starts: Spot[]): Set<string> {
  // Тайл с соседями: за краем — комната по выходу, нет выхода (или угол) — стена.
  const tile = (id: string, c: number, r: number): string => {
    const dc = c < 0 ? -1 : c >= ROOM_W ? 1 : 0, dr = r < 0 ? -1 : r >= ROOM_H ? 1 : 0;
    const room = rooms.get(id)!;
    if (!dc && !dr) return room.tiles[r][c];
    if (dc && dr) return '#';
    const d: Dir = dc < 0 ? 'left' : dc > 0 ? 'right' : dr < 0 ? 'up' : 'down';
    const other = room.exits[d] ? rooms.get(room.exits[d]!) : undefined;
    return other?.tiles[r - dr * ROOM_H]?.[c - dc * ROOM_W] ?? '#';
  };
  // Платформы лифтов на всех этажах — опора (лифт можно вызвать); этажи одного лифта связаны поездкой.
  const liftCells = new Map<string, { id: string; c: number; r: number }[]>(); // клетка платформы → её же клетки на всех этажах
  for (const room of rooms.values()) {
    const s = parseLift(room.meta.lift, room.id);
    const shaft = s && shaftRooms(rooms, room.id, s.stops[s.stops.length - 1]);
    if (!s || !shaft) continue;
    for (let i = 0; i < LIFT_W; i++) {
      const cells = s.stops.map(y => ({ id: shaft[Math.floor(y / ROOM_H)], c: s.x + i, r: y % ROOM_H }));
      for (const cell of cells) liftCells.set(`${cell.id}|${cell.c}|${cell.r}`, cells);
    }
  }
  const passable = (id: string, c: number, r: number) => {
    const t = tile(id, c, r);
    return t !== '#' && t !== '^';
  };
  const clear = (id: string, c0: number, c1: number, r0: number, r1: number) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (!passable(id, c, r)) return false;
    return true;
  };
  const support = (id: string, c: number, r: number) => {
    const t = tile(id, c, r);
    return t === '#' || t === '=' || (t === 'H' && tile(id, c, r - 1) !== 'H') || liftCells.has(`${id}|${c}|${r}`);
  };
  // Центр тела ушёл за край — та же точка в соседней комнате; выхода нет — null.
  const norm = (id: string, c: number, r: number, cx: number): Node | null => {
    const cy = r - H / 2;
    const d: Dir | null = cx < 0 ? 'left' : cx >= ROOM_W ? 'right' : cy < 0 ? 'up' : cy >= ROOM_H ? 'down' : null;
    if (!d) return { id, c, r };
    const to = rooms.get(id)!.exits[d];
    if (!to || !rooms.has(to)) return null;
    const dx = d === 'left' ? ROOM_W : d === 'right' ? -ROOM_W : 0, dy = d === 'up' ? ROOM_H : d === 'down' ? -ROOM_H : 0;
    return norm(to, c + dx, r + dy, cx + dx);
  };
  const stand = (id: string, c: number, r: number): Node | null => {
    const n = norm(id, c, r, c + 1);
    return n && clear(n.id, n.c, n.c + 1, n.r - H, n.r - 1) && (support(n.id, n.c, n.r) || support(n.id, n.c + 1, n.r)) ? n : null;
  };
  // Падение отвесно с (c, r) до опоры; дальше FALL_MAX — не в счёт.
  const fall = (id: string, c: number, r: number): Node | null => {
    for (let k = 0; k <= FALL_MAX; k++) {
      const n = norm(id, c, r + k, c + 1);
      if (!n || !clear(n.id, n.c, n.c + 1, n.r - H, n.r - 1)) return null;
      if (support(n.id, n.c, n.r) || support(n.id, n.c + 1, n.r)) return n;
    }
    return null;
  };
  const onLadder = (id: string, L: number, r: number): Node | null => {
    const n = norm(id, L, r, L + 0.5);
    if (!n || !clear(n.id, n.c - 1, n.c + 1, n.r - H, n.r - 1)) return null;
    for (let rr = n.r - H; rr < n.r; rr++) if (tile(n.id, n.c, rr) === 'H') return n;
    return null;
  };
  // Прыжок по дуге из NINA: с места (разгон в воздухе до v) или с разбега (сразу runSpeed, если сзади две клетки пола).
  const v0 = Math.sqrt(2 * NINA.gravity * NINA.jumpHeight);
  const jumps = (n: Node): Node[] => {
    const out: Node[] = [];
    for (const dir of [-1, 1]) {
      const runUp = !!stand(n.id, n.c - dir, n.r) && !!stand(n.id, n.c - 2 * dir, n.r);
      const arcs = [0, 0.25, 0.5, 0.75, 1].map(k => ({ vx: 0, max: k * NINA.runSpeed }));
      if (runUp) arcs.push({ vx: NINA.runSpeed, max: NINA.runSpeed });
      for (const arc of arcs) {
        let x = n.c + 1, b = n.r, vy = -v0, vx = arc.vx, apex = b;
        for (let f = 0; f < 240; f++) {
          vx = Math.min(arc.max, vx + NINA.accelAir * DT);
          x += dir * vx * DT;
          const dy = vy * DT + 0.5 * NINA.gravity * DT * DT;
          vy = Math.min(vy + NINA.gravity * DT, NINA.maxFall);
          const nb = b + dy;
          if (x - NINA.w / 2 < 0 || x + NINA.w / 2 > ROOM_W || nb - NINA.h < 0 || nb > ROOM_H || nb - apex > FALL_MAX) break;
          const c0 = Math.floor(x - NINA.w / 2 + E), c1 = Math.floor(x + NINA.w / 2 - E), row = Math.floor(nb - E);
          if (dy > 0 && b <= row + E) {
            let held = false;
            for (let c = c0; c <= c1; c++) if (support(n.id, c, row)) held = true;
            if (held) {
              const at = stand(n.id, Math.round(x) - 1, row);
              if (at) out.push(at);
              break;
            }
          }
          if (!clear(n.id, c0, c1, Math.floor(nb - NINA.h + E), row)) break;
          b = nb;
          apex = Math.min(apex, b);
        }
      }
    }
    return out;
  };

  const seen = new Set<string>();
  const queue: { n: Node; ladder: boolean }[] = [];
  const push = (n: Node | null, ladder = false) => {
    if (!n) return;
    const k = `${ladder ? 'L' : 'S'}|${n.id}|${n.c}|${n.r}`;
    if (seen.has(k)) return;
    seen.add(k);
    queue.push({ n, ladder });
  };
  for (const s of starts) push(fall(s.room, Math.round(s.x + NINA.w / 2) - 1, s.bottom));
  while (queue.length) {
    const { n, ladder } = queue.shift()!;
    const { id, c, r } = n;
    if (ladder) {
      const L = c;
      if (tile(id, L, r - 1) === 'H' && tile(id, L, r - 2) !== 'H') {
        push(stand(id, L - 1, r - 1));
        push(stand(id, L, r - 1));
      } else push(onLadder(id, L, r - 1), true);
      if ([L - 1, L, L + 1].some(cc => tile(id, cc, r) === '#')) {
        push(stand(id, L - 1, r));
        push(stand(id, L, r));
      } else push(onLadder(id, L, r + 1), true);
      for (const cc of [L - 2, L - 1, L, L + 1]) push(fall(id, cc, r)); // спрыгнуть с лестницы
      continue;
    }
    for (const d of [-1, 1]) push(fall(id, c + d, r));
    for (const L of [c, c + 1]) {
      for (let rr = r - H; rr < r; rr++) if (tile(id, L, rr) === 'H') { push(onLadder(id, L, r), true); break; }
      if (tile(id, L, r) === 'H') push(onLadder(id, L, r + 1), true);
    }
    for (const cc of [c, c + 1]) for (const cell of liftCells.get(`${id}|${cc}|${r}`) ?? []) push(stand(cell.id, cell.c - (cc - c), cell.r));
    for (const j of jumps(n)) push(j);
  }
  return seen;
}

// Что из целей миссии недостижимо из точек starts (x — левый край тела, как в createNina).
export function unreachable(rooms: Map<string, Room>, starts: Spot[]): string[] {
  const nodes = reachableNodes(rooms, starts);
  const standing = [...nodes].filter(k => k.startsWith('S|')).map(k => k.split('|'));
  return missionTargets(rooms)
    .filter(t => !standing.some(([, id, c, r]) => id === t.room && Number(r) === t.bottom && Math.abs(Number(c) + 1 - t.x) <= 1))
    .map(t => t.what);
}
