import { DT, HAZARD, NINA, ROOM_H, ROOM_W } from '../src/config';
import { LIFT_W, shaftRooms } from '../src/sim/lift';
import type { Spot } from '../src/sim/mission';
import type { Dir, Room } from '../src/world/room';
import { parseLift, parsePoints, parseTerminals } from '../src/world/spawns';

// Достижимость для тестов карты (приёмка №3): поиск пути по клеткам с учётом энергии. Узел «стоит» — тело в колонках
// c, c+1 (центр x = c+1), ноги на строке r (низ тела = r); узел «на лестнице» — центр x = L+0.5. Переходы — шаг,
// падение, прыжок по настоящей дуге из NINA, лестницы, лифты, выходы комнат. Цена перехода — потерянная энергия:
// урон от падения по формуле NINA и вода `~` — HAZARD.waterDps за время в воде (шаг, лестница, падение — клетка за
// 1/NINA.climbSpeed с, самое медленное движение героини; прыжок — по кадрам дуги). Урон по маршруту суммируется,
// отдых не учитывается: узел достижим, если есть путь с уроном меньше NINA.energyMax. Всё с запасом: шипы `^`
// не проходимы, одно падение — не больше FALL_MAX клеток, прыжок — без зацепа за лестницу в воздухе.

const H = Math.ceil(NINA.h);
const E = 1e-6;
// Падение снимает не больше половины энергии.
export const FALL_MAX = NINA.safeFall + Math.floor(NINA.energyMax / 2 / NINA.fallDamagePerCell);
// Энергия за клетку пути в воде.
export const WATER_PER_CELL = HAZARD.waterDps / NINA.climbSpeed;
const fallDamage = (h: number) => Math.max(0, h - NINA.safeFall) * NINA.fallDamagePerCell;

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
interface Step { n: Node; cost: number }

// Наименьший урон до каждого узла (ключ «S|комната|c|r» — стоит, «L|…» — на лестнице) из точек starts; узлы,
// куда без гибели не дойти, в ответ не попадают.
export function routeDamage(rooms: Map<string, Room>, starts: Spot[]): Map<string, number> {
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
  // Тело в колонках c0..c1 и строках r0..r1 задевает воду.
  const wet = (id: string, c0: number, c1: number, r0: number, r1: number) => {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (tile(id, c, r) === '~') return true;
    return false;
  };
  const water = (id: string, c0: number, c1: number, r: number) => (wet(id, c0, c1, r - H, r - 1) ? WATER_PER_CELL : 0);
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
  const stand = (id: string, c: number, r: number): Step | null => {
    const n = norm(id, c, r, c + 1);
    if (!n || !clear(n.id, n.c, n.c + 1, n.r - H, n.r - 1) || !(support(n.id, n.c, n.r) || support(n.id, n.c + 1, n.r))) return null;
    return { n, cost: water(n.id, n.c, n.c + 1, n.r) };
  };
  // Падение отвесно с (c, r) до опоры; дальше FALL_MAX — не в счёт. Цена — урон от высоты и клетки в воде.
  const fall = (id: string, c: number, r: number): Step | null => {
    let cost = 0;
    for (let k = 0; k <= FALL_MAX; k++) {
      const n = norm(id, c, r + k, c + 1);
      if (!n || !clear(n.id, n.c, n.c + 1, n.r - H, n.r - 1)) return null;
      cost += water(n.id, n.c, n.c + 1, n.r);
      if (support(n.id, n.c, n.r) || support(n.id, n.c + 1, n.r)) return { n, cost: cost + fallDamage(k) };
    }
    return null;
  };
  const onLadder = (id: string, L: number, r: number): Step | null => {
    const n = norm(id, L, r, L + 0.5);
    if (!n || !clear(n.id, n.c - 1, n.c + 1, n.r - H, n.r - 1)) return null;
    for (let rr = n.r - H; rr < n.r; rr++) if (tile(n.id, n.c, rr) === 'H') return { n, cost: water(n.id, n.c - 1, n.c + 1, n.r) };
    return null;
  };
  // Прыжок по дуге из NINA: с места (разгон в воздухе до v) или с разбега (сразу runSpeed, если сзади две клетки пола).
  // Цена — кадры в воде и урон от падения с высшей точки дуги.
  const v0 = Math.sqrt(2 * NINA.gravity * NINA.jumpHeight);
  const jumps = (n: Node): Step[] => {
    const out: Step[] = [];
    for (const dir of [-1, 1]) {
      const runUp = !!stand(n.id, n.c - dir, n.r) && !!stand(n.id, n.c - 2 * dir, n.r);
      const arcs = [0, 0.25, 0.5, 0.75, 1].map(k => ({ vx: 0, max: k * NINA.runSpeed }));
      if (runUp) arcs.push({ vx: NINA.runSpeed, max: NINA.runSpeed });
      for (const arc of arcs) {
        let x = n.c + 1, b = n.r, vy = -v0, vx = arc.vx, apex = b, wetT = 0;
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
              if (at) out.push({ n: at.n, cost: wetT * HAZARD.waterDps + fallDamage(row - apex) });
              break;
            }
          }
          if (!clear(n.id, c0, c1, Math.floor(nb - NINA.h + E), row)) break;
          b = nb;
          apex = Math.min(apex, b);
          if (wet(n.id, c0, c1, Math.floor(b - NINA.h + E), Math.floor(b - E))) wetT += DT;
        }
      }
    }
    return out;
  };

  // Дейкстра по корзинам целого урона: цены неотрицательны, лучший урон узла пересчитывается при улучшении.
  const dist = new Map<string, number>();
  const buckets: { n: Node; ladder: boolean; d: number }[][] = Array.from({ length: NINA.energyMax }, () => []);
  const key = (n: Node, ladder: boolean) => `${ladder ? 'L' : 'S'}|${n.id}|${n.c}|${n.r}`;
  const push = (s: Step | null, from: number, ladder = false) => {
    if (!s) return;
    const d = from + s.cost, k = key(s.n, ladder);
    if (d >= NINA.energyMax || (dist.get(k) ?? Infinity) <= d) return;
    dist.set(k, d);
    buckets[Math.floor(d)].push({ n: s.n, ladder, d });
  };
  for (const s of starts) push(fall(s.room, Math.round(s.x + NINA.w / 2) - 1, s.bottom), 0);
  for (const bucket of buckets) {
    while (bucket.length) {
      const { n, ladder, d } = bucket.pop()!;
      if (dist.get(key(n, ladder))! < d) continue;
      const { id, c, r } = n;
      if (ladder) {
        const L = c;
        if (tile(id, L, r - 1) === 'H' && tile(id, L, r - 2) !== 'H') {
          push(stand(id, L - 1, r - 1), d);
          push(stand(id, L, r - 1), d);
        } else push(onLadder(id, L, r - 1), d, true);
        if ([L - 1, L, L + 1].some(cc => tile(id, cc, r) === '#')) {
          push(stand(id, L - 1, r), d);
          push(stand(id, L, r), d);
        } else push(onLadder(id, L, r + 1), d, true);
        for (const cc of [L - 2, L - 1, L, L + 1]) push(fall(id, cc, r), d); // спрыгнуть с лестницы
        continue;
      }
      for (const dc of [-1, 1]) push(fall(id, c + dc, r), d);
      for (const L of [c, c + 1]) {
        for (let rr = r - H; rr < r; rr++) if (tile(id, L, rr) === 'H') { push(onLadder(id, L, r), d, true); break; }
        if (tile(id, L, r) === 'H') push(onLadder(id, L, r + 1), d, true);
      }
      for (const cc of [c, c + 1]) for (const cell of liftCells.get(`${id}|${cc}|${r}`) ?? []) push(stand(cell.id, cell.c - (cc - c), cell.r), d);
      for (const j of jumps(n)) push(j, d);
    }
  }
  return dist;
}

export const reachableNodes = (rooms: Map<string, Room>, starts: Spot[]): Set<string> => new Set(routeDamage(rooms, starts).keys());

// Наименьший урон до каждой цели миссии из точек starts (x — левый край тела, как в createNina); недостижимых нет в ответе.
export function targetDamage(rooms: Map<string, Room>, starts: Spot[]): Map<string, number> {
  const standing = [...routeDamage(rooms, starts)].filter(([k]) => k.startsWith('S|')).map(([k, d]) => [k.split('|'), d] as const);
  const out = new Map<string, number>();
  for (const t of missionTargets(rooms)) {
    for (const [[, id, c, r], d] of standing) {
      if (id === t.room && Number(r) === t.bottom && Math.abs(Number(c) + 1 - t.x) <= 1 && d < (out.get(t.what) ?? Infinity)) out.set(t.what, d);
    }
  }
  return out;
}

// Что из целей миссии недостижимо без гибели из точек starts.
export function unreachable(rooms: Map<string, Room>, starts: Spot[]): string[] {
  const got = targetDamage(rooms, starts);
  return missionTargets(rooms).filter(t => !got.has(t.what)).map(t => t.what);
}
