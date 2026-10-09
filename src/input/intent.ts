export interface Buttons {
  axisX: number;
  up: boolean; down: boolean;
  jump: boolean; attack: boolean; throw: boolean; use: boolean; pause: boolean;
}

export interface Intent {
  moveX: number;
  up: boolean; down: boolean; jump: boolean;
  jumpPressed: boolean; attackPressed: boolean; throwPressed: boolean; usePressed: boolean; pausePressed: boolean;
  upPressed: boolean; downPressed: boolean; // меню ЭВМ: шаг по пунктам
}

export const NO_BUTTONS: Buttons = {
  axisX: 0, up: false, down: false, jump: false, attack: false, throw: false, use: false, pause: false,
};

export const IDLE: Intent = {
  moveX: 0, up: false, down: false, jump: false,
  jumpPressed: false, attackPressed: false, throwPressed: false, usePressed: false, pausePressed: false,
  upPressed: false, downPressed: false,
};

export const DEADZONE = 0.25;

export const KEYMAP = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space'],
  attack: ['KeyJ'],
  throw: ['KeyK'],
  use: ['KeyE'],
  pause: ['Escape'],
} as const;

export const GAME_CODES = new Set<string>(Object.values(KEYMAP).flat());

export function fromKeyboard(keys: ReadonlySet<string>): Buttons {
  const any = (codes: readonly string[]) => codes.some(c => keys.has(c));
  return {
    axisX: (any(KEYMAP.right) ? 1 : 0) - (any(KEYMAP.left) ? 1 : 0),
    up: any(KEYMAP.up), down: any(KEYMAP.down),
    jump: any(KEYMAP.jump), attack: any(KEYMAP.attack), throw: any(KEYMAP.throw),
    use: any(KEYMAP.use), pause: any(KEYMAP.pause),
  };
}

export interface PadSnapshot {
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
}

// Стандартная раскладка W3C: 0 A/✕, 1 B/○, 2 X/□, 3 Y/△, 9 Start, 12–15 крестовина.
export function fromGamepad(p: PadSnapshot): Buttons {
  const btn = (i: number) => !!p.buttons[i]?.pressed;
  let axisX = p.axes[0] ?? 0;
  if (Math.abs(axisX) < DEADZONE) axisX = 0;
  if (btn(14)) axisX = -1;
  if (btn(15)) axisX = 1;
  const axisY = p.axes[1] ?? 0;
  return {
    axisX,
    up: btn(12) || axisY < -0.5,
    down: btn(13) || axisY > 0.5,
    jump: btn(0), attack: btn(2), throw: btn(1), use: btn(3), pause: btn(9),
  };
}

export function merge(a: Buttons, b: Buttons): Buttons {
  return {
    axisX: Math.abs(a.axisX) >= Math.abs(b.axisX) ? a.axisX : b.axisX,
    up: a.up || b.up, down: a.down || b.down,
    jump: a.jump || b.jump, attack: a.attack || b.attack, throw: a.throw || b.throw,
    use: a.use || b.use, pause: a.pause || b.pause,
  };
}

export class IntentTracker {
  private prev: Buttons = NO_BUTTONS;

  update(cur: Buttons): Intent {
    const p = this.prev;
    this.prev = cur;
    return {
      moveX: cur.axisX, up: cur.up, down: cur.down, jump: cur.jump,
      jumpPressed: cur.jump && !p.jump,
      attackPressed: cur.attack && !p.attack,
      throwPressed: cur.throw && !p.throw,
      usePressed: cur.use && !p.use,
      pausePressed: cur.pause && !p.pause,
      upPressed: cur.up && !p.up,
      downPressed: cur.down && !p.down,
    };
  }
}

export function clearPressed(i: Intent): Intent {
  return { ...i, jumpPressed: false, attackPressed: false, throwPressed: false, usePressed: false, pausePressed: false, upPressed: false, downPressed: false };
}

// Удержания из a, нажатия — из a или b (b — кадр, в котором не было шага симуляции).
export function orPressed(a: Intent, b: Intent): Intent {
  return {
    ...a,
    jumpPressed: a.jumpPressed || b.jumpPressed,
    attackPressed: a.attackPressed || b.attackPressed,
    throwPressed: a.throwPressed || b.throwPressed,
    usePressed: a.usePressed || b.usePressed,
    pausePressed: a.pausePressed || b.pausePressed,
    upPressed: a.upPressed || b.upPressed,
    downPressed: a.downPressed || b.downPressed,
  };
}
