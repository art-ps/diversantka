import { SoundEngine } from './engine';

// Звук включается жестом игрока: браузер не даёт AudioContext играть до нажатия или клика.
// make — фабрика контекста (в браузере new AudioContext()); muted — M, помнится между сессиями.
export class AudioGate {
  ctx: AudioContext | null = null;
  sound: SoundEngine | null = null;

  constructor(private make: () => AudioContext, public muted: boolean) {}

  // Любое нажатие, клик или касание: создать звук (один раз) и разбудить; нет Web Audio — игра идёт молча.
  unlock(): void {
    try {
      if (!this.ctx) {
        this.ctx = this.make();
        this.sound = new SoundEngine(this.ctx);
        this.sound.setMuted(this.muted);
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    } catch {
      // нет Web Audio или браузер отказал — без звука
    }
  }

  // Вкладка скрыта — звук спит, видна — просыпается; до первого жеста — ничего.
  visible(v: boolean): void {
    if (this.ctx) (v ? this.ctx.resume() : this.ctx.suspend()).catch(() => {});
  }

  // M: звук выкл/вкл; возвращает новое состояние — его сохраняет main.ts.
  toggleMute(): boolean {
    this.muted = !this.muted;
    this.sound?.setMuted(this.muted);
    return this.muted;
  }
}
