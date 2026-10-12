import { ambientOf } from './audio/ambient';
import { AudioGate } from './audio/gate';
import { DT, ROOM_H, ROOM_W } from './config';
import { createPrologue, stepGame } from './game';
import { lang, setLang, str } from './i18n';
import { InputDevices } from './input/devices';
import { IDLE, IntentTracker, clearPressed, orPressed } from './input/intent';
import { planSteps } from './loop';
import { createAtlas } from './render/atlas';
import { Bloom } from './render/bloom';
import { GlyphBatch } from './render/glyphs';
import { PAL } from './render/palette';
import { drawGame } from './render/scene';
import { loadLang, loadMuted, saveLang, saveMuted, saveResult, storage } from './save';
import { loadWorld } from './world';

function fail(msg: string) {
  const el = document.getElementById('error')!;
  el.textContent = msg;
  el.hidden = false;
}

async function boot() {
  // Язык: выбранный в прошлый раз, иначе по языку браузера. Стартовый экран меняет его стрелками — тогда запоминаем.
  setLang(loadLang(storage(), navigator.language));
  let savedLang = lang();

  // Звук: по первому нажатию (Пробел на стартовом экране), клику или касанию; скрытая вкладка — тишина.
  // Слушатели — до загрузки шрифта: нажатие может прийти раньше, чем игра готова.
  const gate = new AudioGate(() => new AudioContext(), loadMuted(storage()));
  for (const ev of ['pointerdown', 'click', 'keydown', 'touchend'] as const) addEventListener(ev, () => gate.unlock());
  document.addEventListener('visibilitychange', () => gate.visible(!document.hidden));

  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) return fail(str().noWebgl);

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
  const game = createPrologue(rooms, true); // стартовый экран поверх первого кадра пролога

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
    if (e.code === 'KeyM' && !e.repeat) saveMuted(storage(), gate.toggleMute());
    if (e.code === 'KeyF') (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  });

  let acc = 0;
  let last = performance.now();
  let missed = IDLE; // нажатия из кадров без шага симуляции (120 Гц)
  let saved = false; // итог этой миссии уже записан в localStorage
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
    // Звуки шагов этого кадра и фон комнаты; события забираются, даже пока звук не включён.
    try {
      gate.sound?.play(game.sfx);
      gate.sound?.update(ambientOf(game), now / 1000, plan.steps * DT);
    } catch (err) {
      gate.sound = null; // сбой звука не должен ронять кадр — дальше игра идёт молча
      console.warn('Звук отключён из-за ошибки:', err);
    }
    game.sfx.length = 0;
    if (lang() !== savedLang) {
      savedLang = lang();
      saveLang(storage(), savedLang);
    }
    if (game.mission.result === 'won' && !saved) {
      saved = true;
      saveResult(storage(), game.mission.secret);
    }
    if (!game.mission.result) saved = false;
    if (game.clip) {
      // Буфер обмена может отказать (нет фокуса, нажатие с геймпада) — тогда «СКОПИРОВАНО» не показываем.
      navigator.clipboard?.writeText(game.clip).then(() => { game.copied = true; }, () => {});
      game.clip = null;
    }
    bloom.begin(PAL.bg);
    drawGame(batch, game, now / 1000);
    batch.draw(ROOM_W, ROOM_H);
    bloom.end(glow ? 1.2 : 0);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch(e => fail(`Ошибка запуска:\n${(e as Error).message}`));
