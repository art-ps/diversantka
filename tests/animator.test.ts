import { describe, expect, it } from 'vitest';
import { ANIM } from '../src/config';
import { J, type Clip, type Pose } from '../src/anim/clip';
import { ANIM_NAMES, chooseClip, createAnimator, currentPose, updateAnimator } from '../src/anim/animator';
import { lerpPose, sampleClip } from '../src/anim/pose';
import type { Nina } from '../src/sim/nina';

const pose = (v = 0): Pose => Array.from({ length: 26 }, () => v);
const stub = (name: string): Clip => ({ name, fps: 30, loop: true, speed: 0, frames: [pose()], contacts: [3] });
const clips = (over: Clip[] = []) => {
  const m = new Map(ANIM_NAMES.map(n => [n, stub(n)] as [string, Clip]));
  for (const c of over) m.set(c.name, c);
  return m;
};
const nina = (p: { state?: Nina['state']; vx?: number; vy?: number; y?: number; crouching?: boolean } = {}): Nina => ({
  body: { x: 0, y: p.y ?? 10, w: 1.6, h: 5.5, vx: p.vx ?? 0, vy: p.vy ?? 0, onGround: p.state !== 'air' },
  state: p.state ?? 'ground', facing: 1, crouching: p.crouching ?? false,
  energy: 100, dead: false, coyoteT: 0, bufferT: 0, jumpHeld: false, peakY: p.y ?? 10,
});

describe('позы', () => {
  it('смешивание при t=0 и t=1 даёт исходные позы', () => {
    const a = pose(1), b = pose(3);
    expect(lerpPose(a, b, 0)).toEqual(a);
    expect(lerpPose(a, b, 1)).toEqual(b);
    expect(lerpPose(a, b, 0.5)).toEqual(pose(2));
  });

  it('цикл замыкается: между последним и первым кадром — интерполяция', () => {
    const c: Clip = { ...stub('x'), fps: 10, frames: [pose(0), pose(1)], contacts: [0, 0] };
    expect(sampleClip(c, 0.15)[0]).toBeCloseTo(0.5); // 1.5 кадра: между кадром 1 и кадром 0
    expect(sampleClip(c, 0.2)[0]).toBeCloseTo(0);
  });

  it('одноразовый клип держит последний кадр', () => {
    const c: Clip = { ...stub('x'), loop: false, fps: 10, frames: [pose(0), pose(1)], contacts: [0, 0] };
    expect(sampleClip(c, 5)[0]).toBe(1);
  });
});

describe('выбор клипа', () => {
  const a = createAnimator();
  it.each([
    [{ state: 'ladder' as const }, 'climb'],
    [{ state: 'air' as const, vy: -5 }, 'jump'],
    [{ state: 'air' as const, vy: 5 }, 'fall'],
    [{ crouching: true }, 'crouch'],
    [{ vx: 0 }, 'idle'],
    [{ vx: 0.2 }, 'idle'],
    [{ vx: -3 }, 'walk'],
    [{ vx: 12 }, 'run'],
  ])('%o → %s', (p, name) => expect(chooseClip(nina(p), a)).toBe(name));
});

describe('аниматор', () => {
  it('после прыжка с высоты играет приземление, потом idle', () => {
    const a = createAnimator(), cl = clips();
    updateAnimator(a, nina({ state: 'air', vy: 5, y: 5 }), cl, 1 / 60);
    updateAnimator(a, nina({ state: 'ground', y: 10 }), cl, 1 / 60);
    expect(a.clip).toBe('land');
    for (let i = 0; i < 30; i++) updateAnimator(a, nina({ state: 'ground', y: 10 }), cl, 1 / 60);
    expect(a.clip).toBe('idle');
  });

  it('шаг с бордюра без высоты — без приземления', () => {
    const a = createAnimator(), cl = clips();
    updateAnimator(a, nina({ state: 'air', vy: 5, y: 9.5 }), cl, 1 / 60);
    updateAnimator(a, nina({ state: 'ground', y: 10 }), cl, 1 / 60);
    expect(a.clip).toBe('idle');
  });

  it('переход плавный: сразу после смены клипа поза — ещё старая', () => {
    const a = createAnimator();
    const cl = clips([{ ...stub('run'), frames: [pose(4)] }]);
    updateAnimator(a, nina(), cl, 1 / 60);
    updateAnimator(a, nina({ vx: 12 }), cl, 1 / 60);
    expect(a.clip).toBe('run');
    const p = currentPose(a, cl)[0];
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(4);
    for (let i = 0; i < 20; i++) updateAnimator(a, nina({ vx: 12 }), cl, 1 / 60);
    expect(currentPose(a, cl)[0]).toBe(4);
  });

  it('стопа на земле не скользит: фаза бега идёт по пройденному пути', () => {
    // клип: левая стопа уезжает назад на 0.5 клетки за кадр при 10 к/с — скорость записи 5 кл/с
    const frames = Array.from({ length: 8 }, (_, k) => { const p = pose(); p[2 * J.lFoot] = 2 - 0.5 * k; return p; });
    const run: Clip = { name: 'run', fps: 10, loop: true, speed: 5, frames, contacts: frames.map(() => 1) };
    const cl = clips([run]);
    const a = createAnimator();
    const vx = 8; // героиня бежит быстрее, чем актёр
    let x = 0, start: number | null = null;
    for (let i = 0; i < 24; i++) { // 0,4 с
      const n = nina({ vx });
      updateAnimator(a, n, cl, 1 / 60);
      x += vx / 60;
      if (i >= 12) { // после перехода 0,12 с
        const world = x + currentPose(a, cl)[2 * J.lFoot];
        start ??= world;
        expect(Math.abs(world - start)).toBeLessThan(0.05);
      }
    }
  });

  it('на лестнице фаза стоит, пока героиня не двигается', () => {
    const a = createAnimator(), cl = clips();
    updateAnimator(a, nina({ state: 'ladder', y: 10 }), cl, 1 / 60);
    const t = a.t;
    updateAnimator(a, nina({ state: 'ladder', y: 10 }), cl, 1 / 60);
    expect(a.t).toBe(t);
    updateAnimator(a, nina({ state: 'ladder', y: 9.8 }), cl, 1 / 60);
    expect(a.t).toBeGreaterThan(t);
  });
});
