import { expect, it } from 'vitest';
import { AUDIO } from '../src/config';
import { AudioGate } from '../src/audio/gate';
import { CHARSET } from '../src/render/atlas';
import { MAP_HINT } from '../src/render/map';
import { loadMuted, SAVE, saveMuted } from '../src/save';
import { FakeAudio } from './fake-audio';

const gateOf = (muted = false) => {
  const made: FakeAudio[] = [];
  const gate = new AudioGate(() => {
    const f = new FakeAudio();
    made.push(f);
    return f as unknown as AudioContext;
  }, muted);
  return { gate, made };
};

it('до жеста звука нет; первый жест создаёт и будит контекст, следующие — только будят', () => {
  const { gate, made } = gateOf();
  expect(made).toHaveLength(0);
  expect(gate.sound).toBeNull();
  gate.unlock();
  expect(made).toHaveLength(1);
  expect(made[0].state).toBe('running');
  expect(gate.sound).not.toBeNull();
  made[0].state = 'suspended'; // браузер усыпил
  gate.unlock();
  expect(made).toHaveLength(1);
  expect(made[0].resumes).toBe(2);
});

it('нет Web Audio — жесты не ломают игру, звук молчит', () => {
  const gate = new AudioGate(() => { throw new Error('нет AudioContext'); }, false);
  expect(() => { gate.unlock(); gate.unlock(); gate.visible(false); gate.toggleMute(); }).not.toThrow();
  expect(gate.sound).toBeNull();
});

it('M до первого жеста — звук создаётся уже выключенным; M после — громкость 0 и обратно', () => {
  const { gate } = gateOf(true);
  gate.unlock();
  expect(gate.sound!.master.gain.value).toBe(0);
  expect(gate.toggleMute()).toBe(false);
  expect(gate.sound!.master.gain.value).toBe(AUDIO.master);
  expect(gate.toggleMute()).toBe(true);
  expect(gate.sound!.master.gain.value).toBe(0);
});

it('скрытая вкладка усыпляет звук, видимая будит; до жеста — ничего', () => {
  const { gate, made } = gateOf();
  gate.visible(true);
  expect(made).toHaveLength(0);
  gate.unlock();
  gate.visible(false);
  expect(made[0].state).toBe('suspended');
  gate.visible(true);
  expect(made[0].state).toBe('running');
});

it('M помнится в localStorage; бросающее или отсутствующее хранилище — звук включён, игра идёт', () => {
  const data = new Map<string, string>();
  const s = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  expect(loadMuted(s)).toBe(false);
  saveMuted(s, true);
  expect(data.get(SAVE.mute)).toBe('1');
  expect(loadMuted(s)).toBe(true);
  saveMuted(s, false);
  expect(loadMuted(s)).toBe(false);
  const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('quota'); } };
  expect(loadMuted(broken)).toBe(false);
  expect(() => saveMuted(broken, true)).not.toThrow();
  expect(loadMuted(undefined)).toBe(false);
  expect(() => saveMuted(undefined, true)).not.toThrow();
});

it('пауза: подсказка «M — ЗВУК», символы из атласа, строка влезает в экран', () => {
  expect(MAP_HINT).toContain('M — ЗВУК');
  for (const ch of MAP_HINT) expect(CHARSET).toContain(ch);
  expect(MAP_HINT.length * 0.6).toBeLessThan(38);
});
