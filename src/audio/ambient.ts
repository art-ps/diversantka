import { AMBIENT, BEDS, DRIPS, THUNDER } from '../config';
import { flashAt } from '../fx/storm';
import type { Game } from '../game';
import { parseAmbient, type Ambient } from '../world/spawns';
import { hold, playTone, release, type Held } from './voices';

// Фон текущей комнаты: следует за g.roomId — переход экрана, возрождение, «заново».
export const ambientOf = (g: Game): Ambient | null => parseAmbient(g.rooms.get(g.roomId)?.meta.ambient, g.roomId);

// Главный разряд молнии начался между кадрами: яркость перешла порог снизу вверх.
export const thunderEdge = (prev: number, lit: number) => prev < AMBIENT.thunderLit && lit >= AMBIENT.thunderLit;

// Фон по месту: петли комнаты со сменой, гром в такт вспышкам шторма, редкие капли в пещерах.
export class Ambience {
  kind: Ambient | null = null;
  private layers: Held[] = [];
  private lit = 0;

  constructor(private ctx: BaseAudioContext, private out: AudioNode, private noise: AudioBuffer) {}

  update(kind: Ambient | null, time: number, dt: number, muted: boolean): void {
    if (kind !== this.kind) this.change(kind);
    const lit = kind === 'storm' ? flashAt(time).lit : 0;
    const now = this.ctx.currentTime;
    if (!muted && thunderEdge(this.lit, lit)) for (const t of THUNDER) playTone(this.ctx, this.out, this.noise, t, now + AMBIENT.thunderDelay);
    this.lit = lit;
    if (!muted && kind === 'drips' && Math.random() < AMBIENT.dripsPerSec * dt) {
      playTone(this.ctx, this.out, this.noise, DRIPS[Math.floor(Math.random() * DRIPS.length)], now);
    }
  }

  // Старый фон гаснет, новый нарастает — оба за AMBIENT.fade.
  private change(kind: Ambient | null): void {
    for (const h of this.layers) release(this.ctx, h, AMBIENT.fade);
    this.layers = kind ? BEDS[kind].map(t => hold(this.ctx, this.out, this.noise, t, AMBIENT.fade)) : [];
    this.kind = kind;
  }
}
