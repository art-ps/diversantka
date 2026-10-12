import { expect, it } from 'vitest';
import { AUDIO, LOOPS, SOUNDS } from '../src/config';
import { SoundEngine } from '../src/audio/engine';
import { SFX_KINDS, type Sfx } from '../src/sim/sfx';
import { fakeCtx } from './fake-audio';

const ONE_SHOTS = SFX_KINDS.filter(k => k !== 'liftStop' && k !== 'jetOff');

it('у каждого события свои слои; числа синтеза в слышимых пределах', () => {
  expect(SOUNDS.liftStop).toEqual([]);
  expect(SOUNDS.jetOff).toEqual([]);
  for (const k of ONE_SHOTS) expect(SOUNDS[k].length, k).toBeGreaterThan(0);
  for (const t of [...Object.values(SOUNDS).flat(), ...Object.values(LOOPS)]) {
    expect(t.gain).toBeGreaterThan(0);
    expect(t.gain).toBeLessThanOrEqual(0.5);
    expect(t.dur).toBeLessThanOrEqual(3);
    if (t.wave !== 'noise') expect(t.f).toBeGreaterThanOrEqual(20);
    if (t.filter) expect(t.cut).toBeGreaterThanOrEqual(20);
  }
  expect(SOUNDS.stepFloor.every(t => t.dur <= 0.1)).toBe(true); // шаги короткие — не наслаиваются
});

it('событие — слои по рецепту: генераторы и шум запущены и остановлены в конце', () => {
  const { f, ctx } = fakeCtx();
  const e = new SoundEngine(ctx);
  e.play(['tape']);
  const src = f.sources();
  expect(src).toHaveLength(SOUNDS.tape.length);
  for (const s of src) {
    expect(s.started).not.toBeNull();
    expect(s.stopped!).toBeGreaterThan(s.started!);
  }
});

it('M: общая громкость 0, новые звуки не создаются; снова M — громкость назад', () => {
  const { f, ctx } = fakeCtx();
  const e = new SoundEngine(ctx);
  expect(e.master.gain.value).toBe(AUDIO.master);
  e.setMuted(true);
  expect(e.master.gain.value).toBe(0);
  e.play(['jump', 'hit']);
  expect(f.sources()).toHaveLength(0);
  e.setMuted(false);
  expect(e.master.gain.value).toBe(AUDIO.master);
  e.play(['jump']);
  expect(f.sources()).toHaveLength(SOUNDS.jump.length);
});

it('неизвестное событие не ломает звук', () => {
  const { f, ctx } = fakeCtx();
  const e = new SoundEngine(ctx);
  expect(() => e.play(['nope' as Sfx, 'constructor' as Sfx])).not.toThrow();
  expect(f.sources()).toHaveLength(0);
});

it('один звук не чаще AUDIO.minGap; голосов не больше AUDIO.maxVoices, освобождаются по концу звука', () => {
  const { f, ctx } = fakeCtx();
  const e = new SoundEngine(ctx);
  e.play(['jump', 'jump', 'jump']);
  expect(f.sources()).toHaveLength(SOUNDS.jump.length);
  f.currentTime = AUDIO.minGap;
  e.play(['jump']);
  expect(f.sources()).toHaveLength(2 * SOUNDS.jump.length);
  f.currentTime = 10;
  e.play([...ONE_SHOTS, ...ONE_SHOTS]);
  expect(e.busy()).toBe(AUDIO.maxVoices);
  f.currentTime = 20;
  expect(e.busy()).toBe(0);
});

it('петли: гул лифта и струя — один источник от включения до выключения, и без звука тоже', () => {
  const { f, ctx } = fakeCtx();
  const e = new SoundEngine(ctx);
  e.setMuted(true);
  e.play(['liftStart', 'liftStart', 'jetOn']);
  const loops = f.sources().filter(s => s.stopped === null);
  expect(loops).toHaveLength(2);
  e.play(['liftStop', 'liftStop']);
  expect(loops.filter(s => s.stopped !== null)).toHaveLength(1);
  e.play(['jetOff']);
  expect(loops.every(s => s.stopped !== null)).toBe(true);
});
