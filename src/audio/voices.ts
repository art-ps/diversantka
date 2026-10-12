import { AUDIO, type Tone } from '../config';

// Белый шум на секунду — один буфер на весь звук; шумовые слои читают его по кругу со случайного места.
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// Источник → фильтр (если задан) → усилитель → out. Источник ещё не запущен.
function chain(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: Tone, at: number): { src: AudioScheduledSourceNode; amp: GainNode } {
  let src: AudioScheduledSourceNode;
  if (t.wave === 'noise') {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    src = s;
  } else {
    const o = ctx.createOscillator();
    o.type = t.wave;
    o.frequency.setValueAtTime(t.f, at);
    if (t.to) o.frequency.exponentialRampToValueAtTime(t.to, at + t.dur);
    src = o;
  }
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  let last: AudioNode = src;
  if (t.filter) {
    const f = ctx.createBiquadFilter();
    f.type = t.filter;
    f.frequency.value = t.cut ?? 1000;
    f.Q.value = t.q ?? 1;
    src.connect(f);
    last = f;
  }
  last.connect(amp);
  amp.connect(out);
  return { src, amp };
}

// Один слой короткого звука от t0 (+ at): быстрая атака, экспоненциальный спад к концу. Возвращает время конца.
export function playTone(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: Tone, t0: number): number {
  const at = t0 + (t.at ?? 0), end = at + t.dur;
  const { src, amp } = chain(ctx, out, noise, t, at);
  amp.gain.exponentialRampToValueAtTime(t.gain, at + AUDIO.attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  if (t.wave === 'noise') (src as AudioBufferSourceNode).start(at, Math.random() * 0.5); // шум — со случайного места буфера
  else src.start(at);
  src.stop(end + 0.02);
  return end;
}

export interface Held { src: AudioScheduledSourceNode; amp: GainNode; lfo: OscillatorNode | null }

// Петля (гул, шипение, фон): нарастает до t.gain за fade с, звучит до release; lfo — качание громкости ±половина.
export function hold(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: Tone, fade: number): Held {
  const now = ctx.currentTime;
  const { src, amp } = chain(ctx, out, noise, t, now);
  amp.gain.setTargetAtTime(t.gain, now, fade / 3);
  src.start(now);
  let lfo: OscillatorNode | null = null;
  if (t.lfo) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = t.lfo;
    const depth = ctx.createGain();
    depth.gain.value = t.gain / 2;
    lfo.connect(depth);
    depth.connect(amp.gain);
    lfo.start(now);
  }
  return { src, amp, lfo };
}

// Гасит петлю за fade с и останавливает источник.
export function release(ctx: BaseAudioContext, h: Held, fade: number): void {
  const now = ctx.currentTime;
  h.amp.gain.cancelScheduledValues(now);
  h.amp.gain.setTargetAtTime(0, now, fade / 3);
  h.src.stop(now + fade);
  h.lfo?.stop(now + fade);
}
