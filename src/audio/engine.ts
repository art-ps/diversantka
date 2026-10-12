import { AUDIO, LOOPS, SOUNDS } from '../config';
import type { Sfx } from '../sim/sfx';
import { hold, noiseBuffer, playTone, release, type Held } from './voices';

type LoopName = keyof typeof LOOPS;
const LOOP_OF: Partial<Record<string, [LoopName, boolean]>> = {
  liftStart: ['lift', true], liftStop: ['lift', false], jetOn: ['jet', true], jetOff: ['jet', false],
};

// Звук игры: короткие звуки событий, петли лифта и струи, общая громкость и M.
export class SoundEngine {
  readonly master: GainNode;
  readonly noise: AudioBuffer;
  muted = false;
  private ends: Float64Array; // когда освободится каждый голос
  private last: Partial<Record<string, number>> = {}; // когда звук играл последний раз
  private loops: Partial<Record<LoopName, Held>> = {};

  constructor(readonly ctx: BaseAudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = AUDIO.master;
    this.master.connect(ctx.destination);
    this.noise = noiseBuffer(ctx);
    this.ends = new Float64Array(AUDIO.maxVoices);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.master.gain.value = m ? 0 : AUDIO.master;
  }

  // Голосов звучит сейчас.
  busy(): number {
    const now = this.ctx.currentTime;
    let k = 0;
    for (const e of this.ends) if (e > now) k++;
    return k;
  }

  // События кадра: петли включаются и гаснут всегда (без звука — тоже), короткие звуки — если есть свободный голос.
  play(events: readonly Sfx[]): void {
    const now = this.ctx.currentTime;
    for (const k of events) {
      // Чужие строки (в том числе имена из прототипа, «constructor») — мимо.
      const loop = Object.hasOwn(LOOP_OF, k) ? LOOP_OF[k] : undefined;
      if (loop) this.loop(loop[0], loop[1]);
      const tones = Object.hasOwn(SOUNDS, k) ? SOUNDS[k] : undefined;
      if (this.muted || !tones?.length || now - (this.last[k] ?? -Infinity) < AUDIO.minGap) continue;
      let slot = -1;
      for (let i = 0; i < this.ends.length && slot < 0; i++) if (this.ends[i] <= now) slot = i;
      if (slot < 0) continue;
      this.last[k] = now;
      let end = now;
      for (const t of tones) end = Math.max(end, playTone(this.ctx, this.master, this.noise, t, now));
      this.ends[slot] = end;
    }
  }

  private loop(name: LoopName, on: boolean): void {
    const h = this.loops[name];
    if (on && !h) this.loops[name] = hold(this.ctx, this.master, this.noise, LOOPS[name], AUDIO.loopFade);
    if (!on && h) {
      release(this.ctx, h, AUDIO.loopFade);
      this.loops[name] = undefined;
    }
  }
}
