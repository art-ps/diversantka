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
  crouchkick: { windup: 0.1, active: 0.12, recover: 0.2, reach: 1.7, top: 0.55, bottom: 1.0, damage: 1 }, // удар ногой сидя — низко, по ногам
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
