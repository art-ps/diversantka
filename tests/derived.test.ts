import { expect, it } from 'vitest';
import { J, type Clip, type Pose } from '../src/anim/clip';
import { makeCrouchKick } from '../src/anim/derived';

const base = (): Pose => {
  const p: Pose = new Array(26).fill(0);
  const set = (j: number, x: number, y: number) => { p[2 * j] = x; p[2 * j + 1] = y; };
  set(J.head, 0.2, 2.3); set(J.neck, 0.1, 1.9); set(J.pelvis, 0, 1.0);
  set(J.lKnee, 0.6, 0.6); set(J.lFoot, 0.3, 0); set(J.rKnee, -0.2, 0.5); set(J.rFoot, -0.4, 0);
  return p;
};
const crouch: Clip = { name: 'crouch', fps: 30, loop: false, speed: 0, frames: [base(), base()], contacts: [3, 3] };

it('удар сидя: передняя нога выброшена вперёд у пола, остальное — поза приседа', () => {
  const c = makeCrouchKick(crouch);
  expect(c.name).toBe('crouchkick');
  expect(c.loop).toBe(false);
  const b = base();
  const kick = c.frames.reduce((best, f) => (f[2 * J.lFoot] > best[2 * J.lFoot] ? f : best));
  expect(kick[2 * J.lFoot]).toBeGreaterThan(b[2 * J.lFoot] + 1);
  expect(kick[2 * J.lFoot + 1]).toBeLessThan(1);
  for (const j of [J.head, J.neck, J.pelvis, J.rKnee, J.rFoot]) {
    expect(kick[2 * j]).toBe(b[2 * j]);
    expect(kick[2 * j + 1]).toBe(b[2 * j + 1]);
  }
  expect(c.frames[0]).toEqual(b);
  expect(c.frames[c.frames.length - 1]).toEqual(b);
});
