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

const dist = (p: Pose, a: number, b: number) => Math.hypot(p[2 * a] - p[2 * b], p[2 * a + 1] - p[2 * b + 1]);

it('удар сидя: передняя нога выброшена вперёд у пола, остальное — поза приседа', () => {
  const c = makeCrouchKick(crouch);
  expect(c.name).toBe('crouchkick');
  expect(c.loop).toBe(false);
  const b = base();
  const kick = c.frames.reduce((best, f) => (f[2 * J.lFoot] > best[2 * J.lFoot] ? f : best));
  expect(kick[2 * J.lFoot]).toBeGreaterThan(b[2 * J.lFoot] + 0.8);
  expect(kick[2 * J.lFoot + 1]).toBeLessThan(1);
  for (const j of [J.head, J.neck, J.pelvis, J.rKnee, J.rFoot]) {
    expect(kick[2 * j]).toBe(b[2 * j]);
    expect(kick[2 * j + 1]).toBe(b[2 * j + 1]);
  }
  expect(c.frames[0]).toEqual(b);
  expect(c.frames[c.frames.length - 1]).toEqual(b);
});

it('нога выпрямлена на свою длину: бедро и голень как в приседе, стопа далеко впереди и над полом', () => {
  const b = base();
  const c = makeCrouchKick(crouch);
  const kick = c.frames.reduce((best, f) => (f[2 * J.lFoot] > best[2 * J.lFoot] ? f : best));
  expect(dist(kick, J.pelvis, J.lKnee)).toBeCloseTo(dist(b, J.pelvis, J.lKnee), 6);
  expect(dist(kick, J.lKnee, J.lFoot)).toBeCloseTo(dist(b, J.lKnee, J.lFoot), 6);
  const legLen = dist(b, J.pelvis, J.lKnee) + dist(b, J.lKnee, J.lFoot);
  expect(dist(kick, J.pelvis, J.lFoot)).toBeCloseTo(legLen, 6); // нога прямая
  expect(kick[2 * J.lFoot + 1]).toBeGreaterThanOrEqual(0);
});

it('правая нога впереди — выпрямляется правая', () => {
  const b = base();
  const swap = [...b];
  [swap[2 * J.lFoot], swap[2 * J.rFoot]] = [b[2 * J.rFoot], b[2 * J.lFoot]];
  const c = makeCrouchKick({ ...crouch, frames: [swap] });
  const kick = c.frames.reduce((best, f) => (f[2 * J.rFoot] > best[2 * J.rFoot] ? f : best));
  expect(kick[2 * J.rFoot]).toBeGreaterThan(swap[2 * J.rFoot] + 0.7);
  expect(kick[2 * J.lFoot]).toBe(swap[2 * J.lFoot]);
});
