import { DT, ROOM_H, ROOM_W } from './config';
import { createGame, stepGame } from './game';
import { InputDevices } from './input/devices';
import { IDLE, IntentTracker, clearPressed, orPressed } from './input/intent';
import { planSteps } from './loop';
import { createAtlas } from './render/atlas';
import { Bloom } from './render/bloom';
import { GlyphBatch } from './render/glyphs';
import { PAL } from './render/palette';
import { drawGame } from './render/scene';
import { loadWorld } from './world';

const START = { room: 'lab-1', x: 4, bottom: 22 };

function fail(msg: string) {
  const el = document.getElementById('error')!;
  el.textContent = msg;
  el.hidden = false;
}

async function boot() {
  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) return fail('Браузер не поддерживает WebGL2. Откройте игру в свежем Chrome или Safari.');

  let rooms;
  try {
    rooms = loadWorld();
  } catch (e) {
    return fail(`Ошибка в файлах комнат:\n${(e as Error).message}`);
  }

  const batch = new GlyphBatch(gl, await createAtlas('JetBrains Mono'));
  const bloom = new Bloom(gl);
  const input = new InputDevices(window);
  const tracker = new IntentTracker();
  const game = createGame(rooms, START);

  const fit = () => {
    const cell = Math.max(1, Math.floor(Math.min(innerWidth / ROOM_W, innerHeight / ROOM_H)));
    canvas.style.width = `${cell * ROOM_W}px`;
    canvas.style.height = `${cell * ROOM_H}px`;
    canvas.width = Math.round(cell * ROOM_W * devicePixelRatio);
    canvas.height = Math.round(cell * ROOM_H * devicePixelRatio);
    bloom.resize(canvas.width, canvas.height);
  };
  fit();
  addEventListener('resize', fit);

  let glow = true;
  addEventListener('keydown', e => {
    if (e.code === 'KeyB') glow = !glow;
    if (e.code === 'KeyF') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  });

  let acc = 0;
  let last = performance.now();
  let missed = IDLE; // нажатия из кадров без шага симуляции (120 Гц)
  const frame = (now: number) => {
    const plan = planSteps(acc, (now - last) / 1000, DT);
    acc = plan.acc;
    last = now;
    let it = orPressed(tracker.update(input.read()), missed);
    missed = plan.steps === 0 ? it : IDLE;
    for (let i = 0; i < plan.steps; i++) {
      stepGame(game, it, DT);
      it = clearPressed(it);
    }
    bloom.begin(PAL.bg);
    drawGame(batch, game, now / 1000);
    batch.draw(ROOM_W, ROOM_H);
    bloom.end(glow ? 1.2 : 0);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
