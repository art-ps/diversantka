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
const nina = (p: { state?: Nina['state']; vx?: number; vy?: number; y?: number; crouching?: boolean; attack?: Nina['attack']; hurtT?: number; dead?: boolean } = {}): Nina => ({
  body: { x: 0, y: p.y ?? 10, w: 1.6, h: 5.5, vx: p.vx ?? 0, vy: p.vy ?? 0, onGround: p.state !== 'air' },
  state: p.state ?? 'ground', facing: 1, crouching: p.crouching ?? false,
  energy: 100, dead: p.dead ?? false, deadT: 0, attack: p.attack ?? null, hurtT: p.hurtT ?? 0, invulnT: 0, coyoteT: 0, bufferT: 0, jumpHeld: false, skid: false, peakY: p.y ?? 10, held: null, throwT: 0,
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
  it('на лестнице спуск проигрывает клип назад, подъём — вперёд', () => {
    const a = createAnimator(), cl = clips();
    updateAnimator(a, nina({ state: 'ladder', y: 10 }), cl, 1 / 60);
    const t0 = a.t;
    updateAnimator(a, nina({ state: 'ladder', y: 10.2 }), cl, 1 / 60); // вниз (y растёт)
    expect(a.t).toBeLessThan(t0);
    updateAnimator(a, nina({ state: 'ladder', y: 10.0 }), cl, 1 / 60); // вверх
    expect(a.t).toBeCloseTo(t0);
  });

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

  it('присед доходит до нижней позы за ANIM.crouchTime', () => {
    const frames = Array.from({ length: 45 }, (_, k) => pose(k)); // 1.5 с при 30 к/с
    const crouch: Clip = { name: 'crouch', fps: 30, loop: false, speed: 0, frames, contacts: frames.map(() => 0) };
    const cl = clips([crouch]);
    const a = createAnimator();
    updateAnimator(a, nina(), cl, 1 / 60);
    const ticks = Math.ceil((ANIM.crouchTime + ANIM.fade) * 60) + 1;
    for (let i = 0; i < ticks; i++) updateAnimator(a, nina({ crouching: true }), cl, 1 / 60);
    expect(currentPose(a, cl)[0]).toBe(44);
  });

  it('отпустил присед на середине — обычный плавный переход в idle', () => {
    const frames = Array.from({ length: 45 }, (_, k) => pose(k));
    const cl = clips([{ name: 'crouch', fps: 30, loop: false, speed: 0, frames, contacts: frames.map(() => 0) }]);
    const a = createAnimator();
    for (let i = 0; i < 5; i++) updateAnimator(a, nina({ crouching: true }), cl, 1 / 60);
    const mid = currentPose(a, cl)[0];
    updateAnimator(a, nina(), cl, 1 / 60);
    expect(a.clip).toBe('idle');
    const p = currentPose(a, cl)[0];
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(mid);
  });
  it('приземление с горизонтальной скоростью — сразу шаг/бег, без land', () => {
    const a = createAnimator(), cl = clips();
    updateAnimator(a, nina({ state: 'air', vy: 5, y: 5, vx: 10 }), cl, 1 / 60);
    updateAnimator(a, nina({ state: 'ground', y: 10, vx: 10 }), cl, 1 / 60);
    expect(['walk', 'run']).toContain(a.clip);
  });
});

describe('клипы боя в аниматоре', () => {
  it.each([
    [{ dead: true }, 'death'],
    [{ hurtT: 0.2 }, 'hit'],
    [{ state: 'ladder' as const, hurtT: 0.2 }, 'climb'],
    [{ attack: { kind: 'kick' as const, t: 0, hits: [] } }, 'kick'],
  ])('%o → %s', (p, name) => expect(chooseClip(nina(p), createAnimator())).toBe(name));
});
