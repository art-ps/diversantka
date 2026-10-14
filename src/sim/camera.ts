import { CAMERA, ROOM_H, ROOM_W } from '../config';
import { tileAt, type Room } from '../world/room';
import type { CameraSpawn } from '../world/spawns';
import type { Body } from './physics';
import { contains, type Rect } from './rect';

// seen — накопитель: растёт, пока героиня в луче, вне луча остывает; off — выключена с терминала.
export interface Camera extends CameraSpawn { id: string; seen: number; off: boolean }

export const createCamera = (id: string, s: CameraSpawn): Camera => ({ id, ...s, arc: [s.arc[0], s.arc[1]], seen: 0, off: false });

// Угол луча в градусах от вертикали вниз в момент t (время миссии, с): arc[0] → arc[1] → arc[0] за period.
// Функция времени, а не кадров — реплей и возврат к чекпоинту видят тот же луч.
export function cameraAngle(c: CameraSpawn, t: number): number {
  const u = (((t / c.period) % 1) + 1) % 1;
  return c.arc[0] + (c.arc[1] - c.arc[0]) * (1 - Math.abs(2 * u - 1));
}

// Луч не проходит стены, фальш-стены и платформы; закрытые двери и опущенная решётка в solidRoom — уже «#».
export const isOpaque = (t: string) => t === '#' || t === 'S' || t === '=';

// Луч от центра клетки камеры под углом a (градусы) до первого непрозрачного тайла или края комнаты: конец луча
// и задел ли он target по дороге.
export function traceBeam(room: Room, c: CameraSpawn, a: number, target?: Rect): { x: number; y: number; hit: boolean } {
  const rad = (a * Math.PI) / 180, dx = Math.sin(rad), dy = Math.cos(rad);
  const x0 = c.x + 0.5, y0 = c.y + 0.5;
  let x = x0, y = y0, hit = false;
  for (let s = 0; s < ROOM_W + ROOM_H; s += CAMERA.beamStep) {
    const px = x0 + dx * s, py = y0 + dy * s;
    if (px < 0 || px >= ROOM_W || py < 0 || py >= ROOM_H || isOpaque(tileAt(room, Math.floor(px), Math.floor(py)))) break;
    x = px;
    y = py;
    if (target && contains(target, px, py)) hit = true;
  }
  return { x, y, hit };
}

// Что камера видит у героини: тело без нижней четверти — ноги в луче не считаются, присед за укрытием работает.
export const beamTarget = (b: Body): Rect => ({ x: b.x, y: b.y, w: b.w, h: b.h * (1 - CAMERA.feet) });

// Шаг камер комнаты в момент t: накопитель seen дошёл до CAMERA.detect — true (тревога). target null — героини нет.
// Видит луч шириной ±CAMERA.beamWidth: три луча — по краям и посередине; вне луча seen остывает со скоростью CAMERA.cool.
export function stepCameras(cams: Camera[], room: Room, t: number, target: Rect | null, dt: number): boolean {
  let alarm = false;
  for (const c of cams) {
    if (c.off) {
      c.seen = 0;
      continue;
    }
    const a = cameraAngle(c, t), w = CAMERA.beamWidth;
    const hit = target !== null && [a - w, a, a + w].some(x => traceBeam(room, c, x, target).hit);
    c.seen = hit ? c.seen + dt : Math.max(0, c.seen - dt * CAMERA.cool);
    if (c.seen >= CAMERA.detect - 1e-9) alarm = true;
  }
  return alarm;
}
