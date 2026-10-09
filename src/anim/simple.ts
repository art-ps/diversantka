import { ANDROID, ANIM } from '../config';
import type { Android } from '../sim/android';
import type { Clip, Pose } from './clip';
import { lerpPose, sampleClip } from './pose';

// Анимация без своей логики выбора: кто-то снаружи говорит, какой клип и на сколько продвинуть.
export interface SimpleAnim { clip: string; t: number; from: Pose | null; fadeT: number }

export const createSimpleAnim = (): SimpleAnim => ({ clip: 'idle', t: 0, from: null, fadeT: ANIM.fade });

export function simplePose(s: SimpleAnim, clips: Map<string, Clip>): Pose {
  const pose = sampleClip(clips.get(s.clip)!, s.t);
  return s.from && s.fadeT < ANIM.fade ? lerpPose(s.from, pose, s.fadeT / ANIM.fade) : pose;
}

export function playClip(s: SimpleAnim, name: string, advance: number, clips: Map<string, Clip>): void {
  if (name !== s.clip) {
    s.from = simplePose(s, clips);
    s.fadeT = 0;
    s.clip = name;
    s.t = 0;
  }
  s.t += advance;
  s.fadeT += Math.abs(advance);
}

const len = (c: Clip) => (c.frames.length - 1) / c.fps;

// Клип андроида и продвижение по нему за шаг dt (с поправкой на темп).
export function androidClip(a: Android, dt = 0, clips?: Map<string, Clip>): { name: string; advance: number } {
  const L = (n: string) => (clips?.get(n) ? len(clips.get(n)!) : 1);
  const p = ANDROID.punch;
  switch (a.state) {
    case 'dead': return { name: 'death', advance: dt };
    case 'hurt': return { name: 'hit', advance: (dt * L('hit')) / ANDROID.hurtStun };
    case 'throw': return { name: 'throw', advance: (dt * L('throw')) / ANDROID.throwWindup };
    case 'punch': return { name: 'punch', advance: (dt * L('punch')) / (p.windup + p.active + p.recover) };
    default: {
      const s = Math.abs(a.body.vx);
      if (s < ANIM.moveEps) return { name: 'idle', advance: dt };
      const walk = clips?.get('walk');
      return { name: 'walk', advance: walk && walk.speed > 0 ? (s * dt) / walk.speed : dt };
    }
  }
}
