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
