// Звуковые события шага игры: game.ts кладёт их в g.sfx, main.ts отдаёт звуку и очищает массив.
export const SFX_KINDS = [
  'stepFloor', 'stepWater', 'stepLadder', 'jump', 'land', 'landHard',
  'punch', 'kick', 'hit', 'block', 'kill', 'hurt', 'bite', 'death',
  'pickup', 'tape', 'source', 'splash',
  'type', 'menuMove', 'menuSelect',
  'liftStart', 'liftStop', 'liftFloor',
  'flamerWarn', 'jetOn', 'jetOff',
  'switch', 'zap', 'bike', 'mast', 'seaSplash',
] as const;

export type Sfx = (typeof SFX_KINDS)[number];
