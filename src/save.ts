// Итог между сессиями браузера: пройдена ли миссия, найден ли секрет; звук выключен (M). Только флаги, без личных данных.
export const SAVE = { done: 'diversantka.done', secret: 'diversantka.secret', mute: 'diversantka.mute' } as const;

type Store = Pick<Storage, 'setItem'>;

// Сам доступ к localStorage может бросить (запрет сайтовых данных) — тогда хранилища нет.
export function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function saveResult(s: Store | undefined, secret: boolean): void {
  try {
    s?.setItem(SAVE.done, '1');
    if (secret) s?.setItem(SAVE.secret, '1');
  } catch {
    // приватный режим или нет места — игра идёт дальше
  }
}

// Звук выключен клавишей M в прошлый раз. Нет хранилища или оно бросает — звук включён.
export function loadMuted(s: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return s?.getItem(SAVE.mute) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(s: Store | undefined, muted: boolean): void {
  try {
    s?.setItem(SAVE.mute, muted ? '1' : '0');
  } catch {
    // приватный режим — в этой сессии M всё равно работает
  }
}
