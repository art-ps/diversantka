import { ANDROID, COMBAT } from '../config';
import { androidPunchBox, hitAndroid, type Android, type HitResult } from './android';
import { attackBox } from './combat';
import { projectileHit, type Projectile } from './items';
import { hurtNina, type Nina } from './nina';
import type { Room } from '../world/room';
import { moveX } from './physics';
import { bodyRect, overlap } from './rect';

export interface HitEvent { id: string; result: HitResult }

const isDead = (a: Android) => a.state === 'dead'; // функция — чтобы TS не сужал state после hitAndroid
const dirOf = (vx: number): 1 | -1 => (vx >= 0 ? 1 : -1);

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
    if (box && n.attack && !n.attack.hits.includes(a.id) && overlap(box, ar)) {
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
    if (pb && !a.punchHit && overlap(pb, nr)) {
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
