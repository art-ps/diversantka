import { J, type Clip, type Pose } from './clip';

const REACH = 1.8; // насколько вперёд от таза уходит стопа
const FOOT_Y = 0.35; // высота стопы при ударе

// Удар ногой сидя из последней позы приседа: передняя нога выбрасывается вперёд у пола и возвращается.
export function makeCrouchKick(crouch: Clip): Clip {
  const base = crouch.frames[crouch.frames.length - 1];
  const front = base[2 * J.lFoot] >= base[2 * J.rFoot] ? [J.lKnee, J.lFoot] : [J.rKnee, J.rFoot];
  const [knee, foot] = front;
  const px = base[2 * J.pelvis], py = base[2 * J.pelvis + 1];
  const kick = [...base];
  kick[2 * foot] = px + REACH;
  kick[2 * foot + 1] = FOOT_Y;
  kick[2 * knee] = (px + kick[2 * foot]) / 2;
  kick[2 * knee + 1] = (py + FOOT_Y) / 2 + 0.25;
  const mix = (t: number): Pose => base.map((v, i) => v + (kick[i] - v) * t);
  const frames = [base, mix(0.5), kick, kick, mix(0.5), base].map(f => [...f]);
  return { name: 'crouchkick', fps: crouch.fps, loop: false, speed: 0, frames, contacts: frames.map(() => 0) };
}
