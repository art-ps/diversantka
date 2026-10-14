import { ambientOf } from './audio/ambient';
import { AudioGate } from './audio/gate';
import { DT, FX, ROOM_H, ROOM_W } from './config';
import { startMission, stepGame } from './game';
import { lang, setLang, str } from './i18n';
import { InputDevices } from './input/devices';
import { IDLE, IntentTracker, clearPressed, orPressed } from './input/intent';
import { planSteps } from './loop';
import { createAtlas } from './render/atlas';
import { Bloom } from './render/bloom';
import { GlyphBatch } from './render/glyphs';
import { PAL } from './render/palette';
import { drawGame } from './render/scene';
import { loadDone, loadLang, loadMuted, loadRecords, saveLang, saveMuted, saveWin, storage } from './save';
import { missionResult } from './sim/mission';
import { holdMove, packRecord, quitsReplay, replayStep, replayUrl, shareText, unpackReplay, type Replay } from './sim/record';
import { worldOf } from './world';

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

  try {
    worldOf(1); // оба набора комнат проверяются при запуске: ошибка в файле видна сразу, а не при переходе
    worldOf(2);
  } catch (e) {
    return fail(`Ошибка в файлах комнат:\n${(e as Error).message}`);
  }

  const atlas = await createAtlas('JetBrains Mono');
  const batch = new GlyphBatch(gl, atlas);
  const fig = new GlyphBatch(gl, atlas, 4000); // фигуры — отдельный слой свечения
  const bloom = new Bloom(gl);
  const input = new InputDevices(window);
  const tracker = new IntentTracker();
  // Реплей по ссылке ?r=: шаги берутся из записи, устройства — только чтобы выйти. Запись не читается — обычный старт.
  const dropParam = () => {
    const u = new URL(location.href);
    u.searchParams.delete('r');
    try {
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch { /* без адреса не страшно; исключение оборвало бы кадр */ }
  };
  const param = new URLSearchParams(location.search).get('r');
  let replay: Replay | null = null;
  if (param !== null) {
    try {
      replay = { ...(await unpackReplay(param)), i: 0 };
    } catch {
      dropParam();
    }
  }
  // Стартовый экран поверх первого кадра пролога; реплей — с начала своей миссии, как начиналась запись
  // (миссия 2 по ссылке — и без пройденной первой).
  const game = startMission(replay?.mission ?? 1, replay === null);
  let unlocked = loadDone(storage()); // миссия 2 открыта на стартовом экране
  let holdLeft = false; // выход из реплея движением: пока клавишу держат, стартовый экран её не видит
  const leaveReplay = () => {
    replay = null;
    holdLeft = true;
    dropParam();
    Object.assign(game, startMission(1, true));
  };

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
  let share: Promise<string | null> = Promise.resolve(null); // ссылка на реплей победной попытки
  const frame = (now: number) => {
    const plan = planSteps(acc, (now - last) / 1000, DT);
    acc = plan.acc;
    last = now;
    let it = orPressed(tracker.update(input.read()), missed);
    if (!replay) ({ it, hold: holdLeft } = holdMove(it, holdLeft));
    missed = plan.steps === 0 ? it : IDLE;
    if (replay && quitsReplay(it)) {
      leaveReplay();
      it = missed = IDLE; // нажатие, прервавшее реплей, не стартует полёт
    }
    game.unlocked = unlocked; // после возможного выхода из реплея: новая игра узнаёт об открытой миссии 2 до шагов
    for (let i = 0; i < plan.steps; i++) {
      if (replay) {
        // Запись кончилась: итог есть — досматриваем его, нет (запись обрезана или испорчена) — обычный старт.
        const step = replayStep(replay, game.mission.result !== null);
        if (!step) {
          leaveReplay();
          break;
        }
        stepGame(game, step, DT);
        continue;
      }
      stepGame(game, it, DT);
      it = clearPressed(it);
    }
    game.replay = replay !== null;
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
      // Победа: флаги, таблица рекордов (место — для экрана итогов и звука), запись нажатий — в ссылку.
      saved = true;
      if (replay) game.board = { records: loadRecords(storage(), game.missionId), place: null }; // чужая игра: в таблицу и флаги не пишем
      else {
        game.board = saveWin(storage(), game.missionId, missionResult(game.mission));
        if (game.missionId === 1) unlocked = true; // и без хранилища миссия 2 открыта до конца сессии
        share = packRecord(game.rec, game.missionId).then(p => replayUrl(location.href, p), () => null);
      }
    }
    if (!game.mission.result) saved = false;
    if (game.clip) {
      // Строка и ссылка на реплей. Буфер обмена может отказать (нет фокуса, нажатие с геймпада) — тогда «СКОПИРОВАНО» не показываем.
      const line = game.clip, cb = navigator.clipboard, m = game.mission;
      if (cb) share.then(url => cb.writeText(shareText(line, url))).then(() => { if (game.mission === m) game.copied = true; }, () => {}); // игра могла перезапуститься, пока писали
      game.clip = null;
    }
    bloom.begin(PAL.bg);
    drawGame(batch, game, now / 1000, fig);
    batch.draw(ROOM_W, ROOM_H);
    fig.draw(ROOM_W, ROOM_H, true); // в сцену, как раньше
    bloom.layer(() => fig.draw(ROOM_W, ROOM_H)); // и в слой фигур
    bloom.end(glow ? 1.2 : 0, glow ? FX.figGlow : 0);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch(e => fail(`Ошибка запуска:\n${(e as Error).message}`));
