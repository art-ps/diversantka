import { GAME_CODES, fromGamepad, fromKeyboard, merge, type Buttons } from './intent';

export class InputDevices {
  private keys = new Set<string>();

  constructor(target: Window) {
    target.addEventListener('keydown', e => {
      if (GAME_CODES.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    target.addEventListener('keyup', e => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  read(): Buttons {
    let b = fromKeyboard(this.keys);
    for (const p of navigator.getGamepads()) if (p?.connected) b = merge(b, fromGamepad(p));
    return b;
  }
}
