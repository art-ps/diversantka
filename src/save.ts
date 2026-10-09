// Итог между сессиями браузера: пройдена ли миссия, найден ли секрет. Только флаги, без личных данных.
export const SAVE = { done: 'diversantka.done', secret: 'diversantka.secret' } as const;

type Store = Pick<Storage, 'setItem'>;

// Сам доступ к localStorage может бросить (запрет сайтовых данных) — тогда хранилища нет.
export function storage(): Store | undefined {
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
