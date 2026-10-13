import { ANDROID, COMBAT, DOG } from '../config';
import { androidPunchBox, hitAndroid, type Android, type HitResult } from './android';
import { attackBox } from './combat';
import { clearRow } from './doors';
import { hitDog, type Dog } from './dog';
import { hitGuard, type Guard } from './guard';
import { projectileHit, type Projectile } from './items';
import { hurtNina, type Nina } from './nina';
import type { Room } from '../world/room';
import { moveX, type Body } from './physics';
import { bodyRect, overlap, type Rect } from './rect';

export interface HitEvent { id: string; result: HitResult }

const isDead = (a: Android) => a.state === 'dead'; // функция — чтобы TS не сужал state после hitAndroid
const dogDead = (d: Dog) => d.state === 'dead'; // функция — чтобы TS не сужал state после hitDog
const dirOf = (vx: number): 1 | -1 => (vx >= 0 ? 1 : -1);
const center = (b: Body) => b.x + b.w / 2;

// Удар зоной box от from достаёт to, только если на высоте удара между центрами нет стены, закрытой двери,
// опущенной решётки и фальш-стены.
const reaches = (room: Room, from: Body, to: Body, box: Rect) => clearRow(room, center(from), center(to), Math.floor(box.y + box.h / 2));

// Отброс: центр остаётся внутри участка патруля, стены держит moveX.
function push(a: Android, dir: 1 | -1, dist: number, room: Room): void {
  const c = a.body.x + a.body.w / 2;
  moveX(a.body, room, Math.min(Math.max(c + dir * dist, a.patrol[0]), a.patrol[1]) - c);
}

// Все попадания одного шага. Возвращает id андроидов, убитых в этом шаге.
export function resolveCombat(n: Nina, androids: Android[], projectiles: Projectile[], room: Room, events: HitEvent[] = []): string[] {
  const killed: string[] = [];
  const box = attackBox(n.body, n.facing, n.attack);
  const nr = bodyRect(n.body);
  for (const a of androids) {
    if (isDead(a)) continue;
    const ar = bodyRect(a.body);
    if (box && n.attack && !n.attack.hits.includes(a.id) && overlap(box, ar) && reaches(room, n.body, a.body, box)) {
      n.attack.hits.push(a.id);
      const r = hitAndroid(a, COMBAT[n.attack.kind].damage, n.facing);
      if (r !== 'none') events.push({ id: a.id, result: r });
      if ((r === 'hit' || r === 'killed') && n.attack.kind === 'kick') push(a, n.facing, COMBAT.kick.push, room);
    }
    for (const p of projectiles) {
      if (p.from === 'nina' && !isDead(a) && projectileHit(p, ar)) {
        p.alive = false;
        const r = hitAndroid(a, p.damage, dirOf(p.vx));
        if (r !== 'none') events.push({ id: a.id, result: r });
      }
    }
    const pb = androidPunchBox(a);
    if (pb && !a.punchHit && overlap(pb, nr) && reaches(room, a.body, n.body, pb)) {
      a.punchHit = true;
      hurtNina(n, ANDROID.punch.damage, a.facing);
    }
    if (isDead(a)) killed.push(a.id);
  }
  for (const p of projectiles) {
    if (p.from === 'enemy' && projectileHit(p, nr)) {
      p.alive = false;
      hurtNina(n, p.damage, dirOf(p.vx)); // при неуязвимости нож всё равно исчезает
    }
  }
  return killed;
}

// Охранник: удары и снаряды героини (пули по героине — в resolveCombat). Возвращает id убитых.
export function resolveGuards(n: Nina, guards: Guard[], projectiles: Projectile[], room: Room, events: HitEvent[] = []): string[] {
  const killed: string[] = [];
  const box = attackBox(n.body, n.facing, n.attack);
  for (const gd of guards) {
    if (gd.state === 'dead') continue;
    const gr = bodyRect(gd.body);
    if (box && n.attack && !n.attack.hits.includes(gd.id) && overlap(box, gr) && reaches(room, n.body, gd.body, box)) {
      n.attack.hits.push(gd.id);
      const r = hitGuard(gd, COMBAT[n.attack.kind].damage, n.facing);
      if (r !== 'none') events.push({ id: gd.id, result: r });
    }
    for (const p of projectiles) {
      if (p.from === 'nina' && gd.hp > 0 && projectileHit(p, gr)) {
        p.alive = false;
        const r = hitGuard(gd, p.damage, dirOf(p.vx));
        if (r !== 'none') events.push({ id: gd.id, result: r });
      }
    }
    if (gd.hp === 0) killed.push(gd.id);
  }
  return killed;
}

// Собака: удары и снаряды героини, укус в прыжке. Возвращает id убитых.
export function resolveDogs(n: Nina, dogs: Dog[], projectiles: Projectile[], room: Room, events: HitEvent[] = []): string[] {
  const killed: string[] = [];
  const box = attackBox(n.body, n.facing, n.attack);
  const nr = bodyRect(n.body);
  for (const d of dogs) {
    if (d.state === 'dead') continue;
    const dr = bodyRect(d.body);
    if (box && n.attack && !n.attack.hits.includes(d.id) && overlap(box, dr) && reaches(room, n.body, d.body, box)) {
      n.attack.hits.push(d.id);
      events.push({ id: d.id, result: hitDog(d, n.facing) });
    }
    for (const p of projectiles) {
      if (p.from === 'nina' && !dogDead(d) && projectileHit(p, dr)) {
        p.alive = false;
        events.push({ id: d.id, result: hitDog(d, dirOf(p.vx)) });
      }
    }
    if (d.state === 'leap' && !d.bit && overlap(dr, nr)) {
      d.bit = true;
      hurtNina(n, DOG.biteDamage, d.facing);
    }
    if (dogDead(d)) killed.push(d.id);
  }
  return killed;
}
