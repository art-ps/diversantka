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
