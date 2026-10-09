import { describe, expect, it } from 'vitest';
import { framePositions, jointIndex, parseBvh } from '../tools/mocap/bvh.ts';

const BVH = `HIERARCHY
ROOT Hips
{
  OFFSET 0 0 0
  CHANNELS 6 Xposition Yposition Zposition Zrotation Yrotation Xrotation
  JOINT Leg
  {
    OFFSET 0 -10 0
    CHANNELS 3 Zrotation Yrotation Xrotation
    End Site
    {
      OFFSET 0 -10 0
    }
  }
}
MOTION
Frames: 3
Frame Time: .0083333
0 20 0 0 0 0 0 0 0
5 20 3 0 0 0 0 0 90
0 20 0 90 0 0 0 0 0
`;

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe('parseBvh', () => {
  it('читает иерархию, каналы и кадры', () => {
    const b = parseBvh(BVH);
    expect(b.joints.map(j => j.name)).toEqual(['Hips', 'Leg']);
    expect(b.joints[1].parent).toBe(0);
    expect(b.joints[0].children).toEqual([1]);
    expect(b.joints.map(j => j.channelStart)).toEqual([0, 6]);
    expect(b.joints[1].endSite).toEqual([0, -10, 0]);
    expect(b.frameTime).toBeCloseTo(0.0083333);
    expect(b.frames).toHaveLength(3);
    expect(jointIndex(b, 'Leg')).toBe(1);
  });

  it('CRLF и табы не мешают', () => {
    const b = parseBvh(BVH.replace(/\n/g, '\r\n').replace(/ {2}/g, '\t'));
    expect(b.frames[1]).toEqual([5, 20, 3, 0, 0, 0, 0, 0, 90]);
  });

  it('неполный кадр — ошибка с номером кадра', () => {
    expect(() => parseBvh(BVH.replace('0 20 0 90 0 0 0 0 0', '0 20 0 90 0 0 0 0'))).toThrow('BVH: кадр 2 неполный');
  });

  it('нечисло в кадре — ошибка', () => {
    expect(() => parseBvh(BVH.replace('5 20 3', '5 x 3'))).toThrow('BVH: кадр 1 неполный');
  });

  it('нет сустава — ошибка', () => {
    expect(() => jointIndex(parseBvh(BVH), 'Head')).toThrow('BVH: нет сустава Head');
  });
});

describe('framePositions', () => {
  const b = parseBvh(BVH);

  it('нулевая поза', () => {
    const p = framePositions(b, 0);
    close(p.joints[0], [0, 20, 0]);
    close(p.joints[1], [0, 10, 0]);
    close(p.ends[1]!, [0, 0, 0]);
    expect(p.ends[0]).toBeNull();
  });

  it('смещение корня и поворот сустава по X', () => {
    const p = framePositions(b, 1);
    close(p.joints[0], [5, 20, 3]);
    close(p.joints[1], [5, 10, 3]);
    close(p.ends[1]!, [5, 10, -7]);
  });

  it('поворот корня по Z уносит всю цепочку', () => {
    const p = framePositions(b, 2);
    close(p.joints[1], [10, 20, 0]);
    close(p.ends[1]!, [20, 20, 0]);
  });
});
