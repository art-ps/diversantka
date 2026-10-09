import { describe, expect, it } from 'vitest';
import { J } from '../src/anim/clip';
import { parseBvh } from '../tools/mocap/bvh.ts';
import { convertClip, type ClipSpec } from '../tools/mocap/convert.ts';

// Синтетический скелет с именами суставов CMU/cgspeed. Рост в покое: голова 12, стопы −10 → 22 ед.
const HIER = `HIERARCHY
ROOT Hips
{
OFFSET 0 0 0
CHANNELS 6 Xposition Yposition Zposition Zrotation Yrotation Xrotation
JOINT LeftLeg
{
OFFSET 1 -5 0
CHANNELS 3 Zrotation Yrotation Xrotation
JOINT LeftFoot
{
OFFSET 0 -5 0
CHANNELS 3 Zrotation Yrotation Xrotation
End Site
{
OFFSET 0 0 1
}
}
}
JOINT RightLeg
{
OFFSET -1 -5 0
CHANNELS 3 Zrotation Yrotation Xrotation
JOINT RightFoot
{
OFFSET 0 -5 0
CHANNELS 3 Zrotation Yrotation Xrotation
End Site
{
OFFSET 0 0 1
}
}
}
JOINT Neck1
{
OFFSET 0 8 0
CHANNELS 3 Zrotation Yrotation Xrotation
JOINT Head
{
OFFSET 0 2 0
CHANNELS 3 Zrotation Yrotation Xrotation
End Site
{
OFFSET 0 2 0
}
}
JOINT LeftArm
{
OFFSET 2 0 0
CHANNELS 3 Zrotation Yrotation Xrotation
JOINT LeftForeArm
{
OFFSET 0 -3 0
CHANNELS 3 Zrotation Yrotation Xrotation
JOINT LeftHand
{
OFFSET 0 -3 0
CHANNELS 3 Zrotation Yrotation Xrotation
End Site
{
OFFSET 0 -1 0
}
}
}
}
JOINT RightArm
{
OFFSET -2 0 0
CHANNELS 3 Zrotation Yrotation Xrotation
JOINT RightForeArm
{
OFFSET 0 -3 0
CHANNELS 3 Zrotation Yrotation Xrotation
JOINT RightHand
{
OFFSET 0 -3 0
CHANNELS 3 Zrotation Yrotation Xrotation
End Site
{
OFFSET 0 -1 0
}
}
}
}
}
}
MOTION
`;

// 12 суставов × 3 канала + 6 каналов корня = 42 числа в кадре.
// Порядок суставов: LeftLeg, LeftFoot, RightLeg, RightFoot, Neck1, Head, LeftArm, LeftForeArm, LeftHand, RightArm, RightForeArm, RightHand.
function frame(rootZ: number, hipsPitch = 0, leftLegPitch = 0): string {
  const v = new Array(42).fill(0);
  v[1] = 10; // таз на высоте 10 — стопы на земле
  v[2] = rootZ;
  v[5] = hipsPitch;
  v[8] = leftLegPitch; // Xrotation сустава LeftLeg
  return v.join(' ');
}

function bvh(frames: string[], frameTime = 0.1) {
  return parseBvh(`${HIER}Frames: ${frames.length}\nFrame Time: ${frameTime}\n${frames.join('\n')}\n`);
}

const spec = (p: Partial<ClipSpec> = {}): ClipSpec => ({ name: 'run', source: 'x', from: 1, to: 4, loop: false, anchor: 'floor', ...p });
const OPTS = { height: 5.5, fps: 10 };
const pt = (pose: number[], j: number) => [pose[2 * j], pose[2 * j + 1]];

describe('convertClip', () => {
  it('масштаб по росту в покое, якорь — земля, x относительно таза', () => {
    const b = bvh([frame(0), frame(0), frame(2), frame(4), frame(6)]);
    const c = convertClip(b, spec(), OPTS);
    expect(c.frames).toHaveLength(4);
    const p = c.frames[0];
    // масштаб 5.5 / 22 = 0.25
    expect(pt(p, J.pelvis)).toEqual([0, 2.5]);
    expect(pt(p, J.head)[1]).toBeCloseTo(5.5);
    expect(pt(p, J.lFoot)).toEqual([0, 0]);
    expect(pt(p, J.lKnee)[1]).toBeCloseTo(1.25);
  });

  it('скорость — горизонтальный путь таза в клетках в секунду', () => {
    const c = convertClip(bvh([frame(0), frame(0), frame(2), frame(4), frame(6)]), spec(), OPTS);
    expect(c.speed).toBeCloseTo(5); // 2 ед. за кадр × 10 к/с × 0.25
  });

  it('стопы на земле помечены контактом', () => {
    const c = convertClip(bvh([frame(0), frame(0), frame(2), frame(4), frame(6)]), spec(), OPTS);
    expect(c.contacts).toEqual([3, 3, 3, 3]);
  });

  it('боковая проекция: вперёд — это +Z', () => {
    // наклон таза на 90° по X уводит колени назад (−Z) на 5 ед. → x = −1.25
    const c = convertClip(bvh([frame(0), frame(0, 90), frame(0, 90)]), spec({ to: 2, anchor: 'root' }), OPTS);
    expect(pt(c.frames[0], J.lKnee)[0]).toBeCloseTo(-1.25);
  });

  it('якорь root: вертикальное движение таза убрано', () => {
    const rows = [frame(0), frame(0), frame(0), frame(0)];
    const up = rows.map((r, i) => (i === 2 ? r.replace(/^0 10/, '0 14') : r));
    const c = convertClip(bvh(up), spec({ to: 3, anchor: 'root' }), OPTS);
    expect(pt(c.frames[1], J.pelvis)[1]).toBeCloseTo(pt(c.frames[0], J.pelvis)[1]);
  });

  it('цикл обрезается на кадре, ближайшем к первому', () => {
    const angles = [0, 0, 30, 60, 30, 0, 30, 60, 30];
    const c = convertClip(bvh(angles.map(a => frame(0, 0, a))), spec({ to: 8, loop: true }), OPTS);
    expect(c.frames).toHaveLength(4);
    expect(c.loop).toBe(true);
  });

  it('частота кадров приводится к opts.fps', () => {
    const rows = Array.from({ length: 13 }, (_, i) => frame(i));
    const c = convertClip(bvh(rows, 0.05), spec({ to: 12 }), OPTS); // 20 к/с → 10 к/с
    expect(c.fps).toBe(10);
    expect(c.frames).toHaveLength(6);
  });

  it('диапазон вне файла — ошибка', () => {
    expect(() => convertClip(bvh([frame(0), frame(0)]), spec({ to: 5 }), OPTS)).toThrow('run: диапазон 1..5 вне файла из 2 кадров');
  });
});
