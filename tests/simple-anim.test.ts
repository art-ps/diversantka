import { expect, it } from 'vitest';
import { ANDROID, ANIM } from '../src/config';
import type { Clip, Pose } from '../src/anim/clip';
import { androidClip, createSimpleAnim, playClip, simplePose } from '../src/anim/simple';
import { createAndroid } from '../src/sim/android';

const pose = (v: number): Pose => Array.from({ length: 26 }, () => v);
const clip = (name: string, v: number): Clip => ({ name, fps: 30, loop: true, speed: 3, frames: [pose(v)], contacts: [0] });
const clips = new Map(['idle', 'walk', 'punch', 'throw', 'hit', 'death'].map((n, i) => [n, clip(n, i)] as [string, Clip]));

it('смена клипа — плавный переход, потом новая поза', () => {
  const s = createSimpleAnim();
  playClip(s, 'idle', 0.1, clips);
  playClip(s, 'death', 0.01, clips);
  const p = simplePose(s, clips)[0];
  expect(p).toBeGreaterThan(0);
  expect(p).toBeLessThan(5);
  playClip(s, 'death', ANIM.fade, clips);
  expect(simplePose(s, clips)[0]).toBe(5);
});

it('клип андроида по состоянию', () => {
  const a = createAndroid('x', { kind: 'android', x: 20, bottom: 22, patrol: [12, 28] });
  expect(androidClip(a).name).toBe('idle');
  a.body.vx = ANDROID.speed;
  expect(androidClip(a).name).toBe('walk');
  a.state = 'throw';
  expect(androidClip(a).name).toBe('throw');
  a.state = 'dead';
  expect(androidClip(a).name).toBe('death');
});
