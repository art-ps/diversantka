import { ANDROID, COMBAT } from '../config';
import { androidPunchBox, hitAndroid, type Android } from './android';
import { attackBox } from './combat';
import { projectileHit, type Projectile } from './items';
import { hurtNina, type Nina } from './nina';
import { bodyRect, overlap } from './rect';

const isDead = (a: Android) => a.state === 'dead'; // функция — чтобы TS не сужал state после hitAndroid
const dirOf = (vx: number): 1 | -1 => (vx >= 0 ? 1 : -1);

// Все попадания одного шага. Возвращает id андроидов, убитых в этом шаге.
export function resolveCombat(n: Nina, androids: Android[], projectiles: Projectile[]): string[] {
  const killed: string[] = [];
  const box = attackBox(n.body, n.facing, n.attack);
  const nr = bodyRect(n.body);
  for (const a of androids) {
    if (isDead(a)) continue;
    const ar = bodyRect(a.body);
    if (box && n.attack && !n.attack.hits.includes(a.id) && overlap(box, ar)) {
      n.attack.hits.push(a.id);
      hitAndroid(a, COMBAT[n.attack.kind].damage, n.facing);
    }
    for (const p of projectiles) {
      if (p.from === 'nina' && !isDead(a) && projectileHit(p, ar)) {
        p.alive = false;
        hitAndroid(a, p.damage, dirOf(p.vx));
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
