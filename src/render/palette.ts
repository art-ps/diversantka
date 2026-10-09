import type { Color } from './glyphs';

// Люминофор ЭВМ: янтарь, зелёный, холодный голубой; красный — только опасность.
export const PAL = {
  bg: [0.02, 0.025, 0.045, 1] as Color,
  grid: [0.18, 0.24, 0.36, 0.22] as Color,
  wall: [0.9, 0.55, 0.18, 1] as Color,
  wallInner: [0.45, 0.27, 0.09, 1] as Color,
  fake: [0.86, 0.6, 0.26, 1] as Color,
  platform: [0.3, 0.95, 0.55, 1] as Color,
  ladder: [0.45, 0.8, 1.0, 1] as Color,
  water: [0.25, 0.45, 1.0, 1] as Color,
  hazard: [1.0, 0.28, 0.16, 1] as Color,
  nina: [1.0, 0.93, 0.78, 1] as Color,
  hud: [0.55, 0.95, 0.65, 1] as Color,
  hudDim: [0.25, 0.45, 0.3, 1] as Color,
  android: [0.45, 0.72, 1.0, 1] as Color,
  item: [1.0, 0.85, 0.4, 1] as Color,
  projectile: [1.0, 0.95, 0.75, 1] as Color,
  spark: [1.0, 0.95, 0.7, 1] as Color,
  fire: [1.0, 0.5, 0.15, 1] as Color,
  smoke: [0.6, 0.62, 0.68, 0.55] as Color,
  fireHot: [1.0, 0.85, 0.35, 1] as Color,
  danger: [1.0, 0.3, 0.2, 1] as Color,
  dog: [0.85, 0.6, 1.0, 1] as Color,
  static: [0.62, 0.68, 0.75, 0.4] as Color,
  tape: [0.45, 0.95, 1.0, 1] as Color,
};
