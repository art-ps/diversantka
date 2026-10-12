import type { Sfx } from './sim/sfx';
import type { Ambient } from './world/spawns';

export const ROOM_W = 40;
export const ROOM_H = 25;
export const DT = 1 / 60;

// Все числа «ощущения» движения. Единицы: клетки, секунды.
export const NINA = {
  w: 1.2,
  h: 4,
  crouchH: 2.4,
  runSpeed: 14,
  accelGround: 90,
  decelGround: 120,
  landDecel: 40, // торможение после приземления без ввода — тормозной шаг вместо скольжения
  accelAir: 50,
  gravity: 90,
  maxFall: 45,
  jumpHeight: 3.5,
  jumpCut: 0.45,
  coyote: 0.1,
  jumpBuffer: 0.1,
  climbSpeed: 8,
  safeFall: 8,
  fallDamagePerCell: 6,
  energyMax: 100,
  regenPerSec: 4,
  ladderJump: 0.6,
  lowEnergy: 25,
  respawnDelay: 1.0, // пауза после смерти, пока прыжок не возвращает на старт
};

export const TRANSITION_TIME = 0.3;

// Лифт: скорость — клеток/с, время — с, расстояние — клетки.
export const LIFT = {
  speed: 8,
  dwell: 0.5, // после остановки стоит, прежде чем по удержанию вверх/вниз ехать дальше
  callRange: 3, // E вызывает лифт, если центр героини ближе к середине шахты по X
  panelHz: 1.5, // панель вызова у шахты мигает, пока лифта на этаже нет
};

export type NinaConfig = typeof NINA;

// Анимация: числа «ощущения».
export const ANIM = {
  crouchTime: 0.2, // за сколько секунд присед доходит до нижней позы
  fade: 0.12, // секунды перехода между клипами
  moveEps: 0.3, // медленнее — стоит (idle)
  walkBelow: 7, // медленнее — шаг, быстрее — бег
  landTime: 0.25, // сколько играет приземление
  landMinFall: 1.5, // с какой высоты падения (клетки) играть приземление
  legScale: 0.85, // ноги короче записи — пропорции персонажа игры
};

// Бой: время — секунды, дальность — клетки; top/bottom — полоса удара по высоте, доли роста от макушки.
export const COMBAT = {
  punch: { windup: 0.08, active: 0.1, recover: 0.15, reach: 1.3, top: 0.15, bottom: 0.45, damage: 1 },
  kick: { windup: 0.15, active: 0.12, recover: 0.25, reach: 1.9, top: 0.35, bottom: 0.75, damage: 1, push: 1.5 }, // push — отброс андроида, клеток
  flykick: { windup: 0.05, active: 0.3, recover: 0.1, reach: 1.6, top: 0.4, bottom: 0.9, damage: 1 },
  crouchkick: { windup: 0.1, active: 0.12, recover: 0.2, reach: 1.8, top: 0.55, bottom: 1.0, damage: 1 }, // удар ногой сидя — низко, по ногам
  hurtStun: 0.35, // оглушение после попадания — ввод не слушается
  hurtInvuln: 0.8, // неуязвимость после попадания
  hurtPush: 5, // отбрасывание, клеток/с
  throwTime: 0.3, // сколько играет бросок
  throwAngle: 30, // градусов вверх/вниз при броске по диагонали
  items: {
    knife: { speed: 24, gravity: 0, damage: 1 },
    stone: { speed: 16, gravity: 30, damage: 1 },
    wrench: { speed: 18, gravity: 30, damage: 1 },
  },
};

// Андроид-охранник: скорости — клеток/с, время — с.
export const ANDROID = {
  w: 1.2,
  h: 4,
  hp: 3,
  speed: 3, // патруль
  chaseSpeed: 5,
  sight: 14, // видит героиню на своём этаже не дальше
  floorTol: 0.5, // «тот же этаж» — разница низа тел меньше
  meleeRange: 2.6, // ближе — бьёт рукой
  throwMin: 4, // дальше — бросает нож
  throwWindup: 0.4,
  throwCooldown: 1.8,
  knifeHeight: 0.2, // нож летит на этой доле роста от макушки — на уровне головы
  knifeSpeed: 20,
  knifeDamage: 12, // энергии героини
  punch: { windup: 0.25, active: 0.1, recover: 0.4, reach: 2.0, top: 0.15, bottom: 0.45, damage: 10 },
  punchCooldown: 0.5,
  hurtStun: 0.3,
  hitInvuln: 0.6, // после попадания андроид неуязвим — серию подряд не провести
};

// Эффекты: всплывающие числа урона.
export const FX = {
  floatTime: 0.8, // сколько живёт число, с
  floatRise: 1.6, // на сколько клеток поднимается
  floatFade: 0.3, // последние секунды — гаснет
  sparkCount: 6,
  sparkLife: 0.35,
  sparkSpeed: 10,
  crumbleLife: 1.2,
  crumbleGravity: 30,
  damageFlush: 0.3, // непрерывный урон показывается числом не чаще
  smokePerSec: 1.5, // дыма в секунду на клетку ширины ямы
  smokeLife: 2.2,
  smokeRise: 1.6, // клеток/с вверх
  smokePuff: 6, // клуб дыма на месте рассыпавшегося врага
  splashBurst: 8, // капель при входе в воду
  splashPerSec: 12, // при ходьбе по воде
  splashLife: 0.5,
  staticIn: 1, // помехи при смерти нарастают за, с
  staticDensity: 0.5, // доля полклеток со «снегом»
};

// Огнемёт-ловушка: время — с, длина — клетки, урон — энергия/с.
export const FLAMER = {
  off: 2.0, // пауза
  on: 1.5, // огонь
  warn: 0.4, // искрит перед залпом (последние секунды паузы)
  length: 6,
  halfH: 0.4, // полувысота струи
  dps: 30,
  sparksPerSec: 8, // искр в секунду (сама струя — поле жара, см. FIRE)
};

// Живой огонь (поле жара): высота — клетки, остывание — единиц тепла за шаг (язык ~ 36/cool полклеток).
export const FIRE = {
  pitRise: 1, // языки ям — до 1 клетки над тайлом
  pitCool: 12,
  jetCool: 3, // струя ~ 12 полклеток = FLAMER.length
  jetWidth: 3, // полклеток поперёк струи
  jetLift: 0.06, // струя чуть задирается вверх
};

// Сторожевая собака: скорости — клеток/с, время — с.
export const DOG = {
  w: 1.6,
  h: 1.5,
  hp: 1,
  speed: 4, // патруль
  chaseSpeed: 16, // быстрее бега героини
  sight: 14,
  floorTol: 0.5,
  leapRange: 3.5, // ближе — прыжок с укусом
  leapVx: 14,
  leapVy: -9,
  gravity: 60,
  biteDamage: 8,
  recoil: 0.35, // отскок после прыжка
  recoilSpeed: 6,
  cooldown: 1.0,
};

// Опасные тайлы: шипы бьют как удар врага, вода жжёт медленно.
export const HAZARD = {
  spikeDamage: 15,
  spikeBounce: 12, // подброс вверх, клеток/с
  waterDps: 10,
};

// Миссия: время — с, расстояния — клетки.
export const MISSION = {
  time: 15 * 60, // таймер миссии
  tapes: 6, // перфолент на карте
  lowTime: 60, // меньше — таймер в HUD красный
  useRange: 1.5, // E/Y работает, если центр героини ближе к объекту по X
  bootTime: 1.0, // печать лога загрузки ЭВМ; пока печатается, меню не слушает ввод
  outroTime: 3.0, // выезд на мотоцикле
  restartDelay: 1.0, // пауза на экране итога/провала, пока прыжок не начинает заново
};

// Мотоцикл в сцене выезда: колёса — клетки, дым — с и клетки/с.
export const BIKE = {
  wheelR: 0.75, // радиус колеса: спица меняет символ каждые 45° поворота
  smokeEvery: 0.08, // клуб дыма из глушителя каждые, с
  smokeLife: 0.9,
  smokeRise: 1.5, // клеток/с вверх
  smokeDrift: 0.6, // клеток/с назад
};

// Источник в секретной комнате: пульс — Гц, искры — в секунду, клетки/с.
export const SOURCE = {
  pulseHz: 1.2,
  sparksPerSec: 6,
  sparkLife: 1.2,
  sparkRise: 1.5,
};

// Пролог: дельтаплан сам летит вправо с медленным снижением. Путь и высоты — клетки, скорость — клеток/с, время — с.
export const PROLOGUE = {
  speed: 8,
  startD: 3, // путь в начале пролога: центр дельтаплана на первом экране
  bottomFrom: 9, // низ ног Нины в начале пути…
  bottomTo: 14, // …и в конце последнего экрана
  span: 6, // ширина дельтаплана
  height: 8.2, // от верха крыла до ног Нины
  armTime: 0.5, // в начале полёта прыжок ещё не отцепляет
  retryDelay: 1.5, // после всплеска или удара о мачту — пролог заново
};

// Стартовый экран: «ПРОБЕЛ — НАЧАТЬ» мигает, Гц (полпериода горит, полпериода погашена).
export const TITLE = {
  blinkHz: 1,
};

// Шторм над прологом: дождь — капель на экран и клеток/с, зыбь — клетки и волн/с, вспышки — с.
export const STORM = {
  drops: 120,
  rainSpeed: 22, // клеток/с вниз
  slant: 0.5, // клеток влево на клетку вниз: ветер с моря справа
  ridge: 12, // средняя строка гребня гор
  swellAmp: 1, // полвысоты зыби, клетки
  swellLen: 20, // длина волны, клетки
  swellHz: 0.12, // волн в секунду мимо точки
  foam: 0.3, // гребень выше этой доли — барашек
  flashLoop: 12, // расписание вспышек повторяется
};

// Звук в симуляции: шаги — клеток пути на один звук, высоты — клетки, время — с.
export const SFX = {
  stride: 2.2, // шаг по полу и по воде: на бегу ~6 в секунду
  ladderStride: 1.5, // ступенька лестницы
  landMin: 1, // приземление с меньшей высоты — без звука
  typeEvery: 0.06, // щелчок печати лога ЭВМ
};

// Звук: громкости 0..1, время — с, частоты — Гц. Синтез на слух не проверен — крутить здесь.
export const AUDIO = {
  master: 0.6, // общая громкость; M — 0
  maxVoices: 12, // коротких звуков одновременно; лишние пропускаются
  minGap: 0.04, // один и тот же звук не чаще
  attack: 0.005, // нарастание каждого слоя
  loopFade: 0.08, // петли (лифт, струя) нарастают и гаснут за
};

export type Wave = 'noise' | 'sine' | 'square' | 'sawtooth' | 'triangle';

// Слой звука: генератор (частота f → to за dur) или белый шум; фильтр (срез cut, добротность q); громкость gain; начало at от события.
export interface Tone {
  wave: Wave;
  f: number;
  to?: number;
  dur: number;
  gain: number;
  at?: number;
  filter?: 'lowpass' | 'highpass' | 'bandpass';
  cut?: number;
  q?: number;
  lfo?: number; // только петли: качание громкости, Гц (порывы, волны)
}

const hiss = (dur: number, gain: number, filter: Tone['filter'], cut: number, q = 1, at = 0): Tone => ({ wave: 'noise', f: 0, dur, gain, filter, cut, q, at });

// Короткие звуки событий (src/sim/sfx.ts). liftStop и jetOff только гасят петли — своих слоёв нет.
export const SOUNDS: Record<Sfx, Tone[]> = {
  stepFloor: [hiss(0.05, 0.22, 'lowpass', 900), { wave: 'sine', f: 110, to: 60, dur: 0.05, gain: 0.18 }],
  stepWater: [hiss(0.12, 0.22, 'bandpass', 1400, 1.5)],
  stepLadder: [{ wave: 'square', f: 220, to: 200, dur: 0.04, gain: 0.07, filter: 'lowpass', cut: 1200 }, hiss(0.03, 0.1, 'highpass', 3000)],
  jump: [{ wave: 'square', f: 180, to: 360, dur: 0.12, gain: 0.1, filter: 'lowpass', cut: 1500 }],
  land: [hiss(0.08, 0.3, 'lowpass', 400), { wave: 'sine', f: 90, to: 50, dur: 0.1, gain: 0.25 }],
  landHard: [hiss(0.2, 0.45, 'lowpass', 300), { wave: 'sine', f: 70, to: 35, dur: 0.25, gain: 0.45 }],
  punch: [hiss(0.06, 0.28, 'bandpass', 1000, 0.8)],
  kick: [hiss(0.1, 0.32, 'bandpass', 600, 0.8)],
  hit: [{ wave: 'square', f: 160, to: 80, dur: 0.08, gain: 0.2, filter: 'lowpass', cut: 1200 }, hiss(0.05, 0.28, 'lowpass', 2000)],
  block: [{ wave: 'triangle', f: 900, to: 850, dur: 0.1, gain: 0.16 }, { wave: 'square', f: 1300, dur: 0.05, gain: 0.04, filter: 'highpass', cut: 1000 }],
  kill: [{ wave: 'sawtooth', f: 300, to: 40, dur: 0.45, gain: 0.2, filter: 'lowpass', cut: 1500 }, hiss(0.4, 0.22, 'lowpass', 1200)],
  hurt: [{ wave: 'square', f: 400, to: 200, dur: 0.15, gain: 0.15, filter: 'lowpass', cut: 1600 }],
  bite: [hiss(0.07, 0.28, 'bandpass', 2500, 2), { wave: 'square', f: 300, to: 150, dur: 0.07, gain: 0.1, filter: 'lowpass', cut: 2000 }],
  death: [{ wave: 'triangle', f: 440, to: 55, dur: 1, gain: 0.28 }, hiss(0.8, 0.12, 'lowpass', 600)],
  pickup: [{ wave: 'square', f: 660, to: 990, dur: 0.08, gain: 0.1, filter: 'lowpass', cut: 3000 }],
  tape: [523, 659, 784].map((f, i) => ({ wave: 'triangle' as const, f, dur: 0.45 - i * 0.06, gain: 0.13, at: i * 0.06 })),
  source: [{ wave: 'sine', f: 220, to: 440, dur: 1.2, gain: 0.18 }, { wave: 'triangle', f: 330, to: 660, dur: 1.2, gain: 0.1 }],
  splash: [hiss(0.3, 0.3, 'lowpass', 1800), hiss(0.2, 0.2, 'bandpass', 600)],
  type: [{ wave: 'square', f: 1800, dur: 0.015, gain: 0.04, filter: 'highpass', cut: 1000 }],
  menuMove: [{ wave: 'square', f: 880, dur: 0.04, gain: 0.07 }],
  menuSelect: [{ wave: 'square', f: 880, dur: 0.05, gain: 0.07 }, { wave: 'square', f: 1320, dur: 0.07, gain: 0.07, at: 0.06 }],
  liftStart: [hiss(0.15, 0.28, 'lowpass', 250)],
  liftStop: [],
  liftFloor: [hiss(0.12, 0.35, 'lowpass', 300), { wave: 'sine', f: 80, to: 50, dur: 0.15, gain: 0.3 }],
  flamerWarn: [hiss(0.25, 0.1, 'highpass', 4000), { wave: 'square', f: 2400, dur: 0.05, gain: 0.03 }],
  jetOn: [hiss(0.15, 0.3, 'lowpass', 900)],
  jetOff: [],
  switch: [{ wave: 'square', f: 120, dur: 0.03, gain: 0.18 }, hiss(0.04, 0.18, 'highpass', 2000)],
  zap: [{ wave: 'sawtooth', f: 60, dur: 0.3, gain: 0.18 }, hiss(0.3, 0.14, 'highpass', 3000)],
  bike: [{ wave: 'sawtooth', f: 70, to: 160, dur: 2.5, gain: 0.22, filter: 'lowpass', cut: 700 }, { wave: 'square', f: 35, to: 80, dur: 2.5, gain: 0.1, filter: 'lowpass', cut: 400 }],
  mast: [hiss(0.6, 0.45, 'lowpass', 1200), { wave: 'square', f: 200, to: 40, dur: 0.4, gain: 0.18 }, { wave: 'triangle', f: 1200, to: 1100, dur: 0.8, gain: 0.07 }],
  seaSplash: [hiss(0.9, 0.45, 'lowpass', 1500), hiss(1.2, 0.35, 'lowpass', 300)],
};

// Петли, пока событие не погасит: гул лифта в пути (liftStart…liftStop), шипение струи (jetOn…jetOff).
export const LOOPS: Record<'lift' | 'jet', Tone> = {
  lift: { wave: 'sawtooth', f: 55, dur: 0, gain: 0.2, filter: 'lowpass', cut: 260 },
  jet: hiss(0, 0.25, 'bandpass', 1800, 0.7),
};

// Фон по месту (ключ шапки «ambient:»): тихие петли, смена при переходе экрана, гром в такт молнии, капель.
export const AMBIENT = {
  fade: 0.8, // старый фон гаснет, новый нарастает за, с
  thunderLit: 0.95, // вспышка ярче — главный разряд (flashAt из src/fx/storm.ts)
  thunderDelay: 0.3, // гром после разряда, с
  dripsPerSec: 1.5, // капель в пещере
};

export const BEDS: Record<Ambient, Tone[]> = {
  storm: [hiss(0, 0.16, 'lowpass', 2500), { ...hiss(0, 0.08, 'highpass', 5000), lfo: 0.3 }], // ливень
  hum: [{ wave: 'sawtooth', f: 50, dur: 0, gain: 0.05, filter: 'lowpass', cut: 180 }, { wave: 'sine', f: 100, dur: 0, gain: 0.04 }], // машинный зал
  drips: [hiss(0, 0.03, 'lowpass', 300)], // гулкая тишина пещеры
  river: [{ ...hiss(0, 0.14, 'bandpass', 500, 0.6), lfo: 0.4 }, hiss(0, 0.06, 'lowpass', 200)], // течение
  wind: [{ ...hiss(0, 0.12, 'bandpass', 700, 1.2), lfo: 0.15 }], // ветер порывами
};

export const THUNDER: Tone[] = [hiss(2.5, 0.45, 'lowpass', 160), hiss(1.2, 0.25, 'lowpass', 600, 1, 0.05)];
export const DRIPS: Tone[] = [1400, 1100, 1700].map(f => ({ wave: 'sine' as const, f, to: f / 2, dur: 0.12, gain: 0.07 }));
