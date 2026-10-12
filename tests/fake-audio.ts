// Подделка Web Audio для тестов: узлы запоминают параметры и вызовы, звука нет, браузер не нужен.
export class FakeParam {
  value = 0;
  calls: string[] = [];
  setValueAtTime(v: number) { this.value = v; this.calls.push('set'); return this; }
  linearRampToValueAtTime(v: number) { this.value = v; this.calls.push('linear'); return this; }
  exponentialRampToValueAtTime(v: number) { this.value = v; this.calls.push('exp'); return this; }
  setTargetAtTime(v: number) { this.value = v; this.calls.push('target'); return this; }
  cancelScheduledValues() { this.calls.push('cancel'); return this; }
}

export class FakeNode {
  out: FakeNode[] = [];
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  type = '';
  loop = false;
  buffer: unknown = null;
  started: number | null = null;
  stopped: number | null = null;
  constructor(readonly kind: string) {}
  connect(n: FakeNode) { this.out.push(n); return n; }
  disconnect() { this.out = []; }
  start(t = 0) { this.started = t; }
  stop(t = 0) { this.stopped = t; }
}

export class FakeAudio {
  currentTime = 0;
  sampleRate = 8000;
  state = 'suspended'; // как в браузере до жеста игрока
  resumes = 0;
  destination = new FakeNode('destination');
  nodes: FakeNode[] = [];
  private make(kind: string) { const n = new FakeNode(kind); this.nodes.push(n); return n; }
  createGain() { const n = this.make('gain'); n.gain.value = 1; return n; }
  createOscillator() { return this.make('osc'); }
  createBufferSource() { return this.make('noise'); }
  createBiquadFilter() { return this.make('filter'); }
  createBuffer(_ch: number, len: number) { const d = new Float32Array(len); return { length: len, getChannelData: () => d }; }
  resume() { this.state = 'running'; this.resumes++; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  sources() { return this.nodes.filter(n => n.kind === 'osc' || n.kind === 'noise'); }
}

// Подделка под тип браузера — для конструктора SoundEngine.
export const fakeCtx = () => {
  const f = new FakeAudio();
  return { f, ctx: f as unknown as BaseAudioContext };
};
