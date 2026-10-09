import { J, type Clip, type Pose } from './clip';

const FOOT_Y = 0.35; // высота стопы при ударе

// Удар ногой сидя из последней позы приседа: передняя нога выпрямляется на свою длину вперёд у пола и возвращается.
export function makeCrouchKick(crouch: Clip): Clip {
  const base = crouch.frames[crouch.frames.length - 1];
  const [knee, foot] = base[2 * J.lFoot] >= base[2 * J.rFoot] ? [J.lKnee, J.lFoot] : [J.rKnee, J.rFoot];
  const px = base[2 * J.pelvis], py = base[2 * J.pelvis + 1];
  const len = (a: number, b: number) => Math.hypot(base[2 * a] - base[2 * b], base[2 * a + 1] - base[2 * b + 1]);
  const thigh = len(J.pelvis, knee), shin = len(knee, foot), leg = thigh + shin;
  // Прямая нога от таза вперёд и вниз так, чтобы стопа оказалась на высоте FOOT_Y (или как можно ниже).
  const drop = Math.min(Math.max(py - FOOT_Y, 0), leg);
  const ux = Math.sqrt(leg * leg - drop * drop) / leg, uy = -drop / leg;
  const kick = [...base];
  kick[2 * knee] = px + ux * thigh;
  kick[2 * knee + 1] = py + uy * thigh;
  kick[2 * foot] = px + ux * leg;
  kick[2 * foot + 1] = py + uy * leg;
  const mix = (t: number): Pose => base.map((v, i) => v + (kick[i] - v) * t);
  const frames = [base, mix(0.5), kick, kick, mix(0.5), base].map(f => [...f]);
  return { name: 'crouchkick', fps: crouch.fps, loop: false, speed: 0, frames, contacts: frames.map(() => 0) };
}
