import type { Lang } from './i18n';

// Итог между сессиями браузера: пройдена ли миссия, найден ли секрет; звук выключен (M); язык; таблица рекордов.
// Только флаги и числа, без имён и личных данных. Рекорды второй миссии лягут под ключ diversantka.records.2.
export const SAVE = { done: 'diversantka.done', secret: 'diversantka.secret', mute: 'diversantka.mute', lang: 'diversantka.lang', records: 'diversantka.records' } as const;

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

// Язык, выбранный на стартовом экране. Записи нет, она чужая или хранилище бросает — по языку браузера:
// ru* — русский, иначе English.
export function loadLang(s: Pick<Storage, 'getItem'> | undefined, browser: string | undefined): Lang {
  let v: string | null | undefined;
  try {
    v = s?.getItem(SAVE.lang);
  } catch {
    v = undefined;
  }
  if (v === 'en' || v === 'ru') return v;
  return browser?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function saveLang(s: Store | undefined, l: Lang): void {
  try {
    s?.setItem(SAVE.lang, l);
  } catch {
    // приватный режим — в этой сессии язык всё равно выбран
  }
}

// Строка таблицы рекордов: время миссии в секундах, полученные удары, попадания по врагам, источник, день «ГГГГ-ММ-ДД».
export interface RecordRow { seconds: number; hits: number; attacks: number; secret: boolean; date: string }
export const RECORDS_MAX = 10;
// Таблица на экране итогов: рекорды и место этой игры (null — не вошла, реплей или нет хранилища).
export interface Board { records: RecordRow[]; place: number | null }

const isRow = (v: unknown): v is RecordRow => {
  const r = v as RecordRow;
  return typeof v === 'object' && v !== null && Number.isFinite(r.seconds) && Number.isFinite(r.hits) && Number.isFinite(r.attacks)
    && typeof r.secret === 'boolean' && typeof r.date === 'string';
};

// Рекорды по возрастанию времени. Нет хранилища, оно бросает или запись испорчена — рекордов нет.
export function loadRecords(s: Pick<Storage, 'getItem'> | undefined): RecordRow[] {
  try {
    const v: unknown = JSON.parse(s?.getItem(SAVE.records) ?? '[]');
    return Array.isArray(v) ? v.filter(isRow).sort((a, b) => a.seconds - b.seconds).slice(0, RECORDS_MAX) : [];
  } catch {
    return [];
  }
}

// Новый результат в таблицу: после всех с тем же временем (раньше записанная — выше). Возвращает место 1–10;
// null — не вошёл в десятку или хранилище недоступно.
export function saveRecord(s: Pick<Storage, 'getItem' | 'setItem'> | undefined, r: RecordRow): number | null {
  if (!s) return null;
  const list = loadRecords(s);
  const at = list.findIndex(x => x.seconds > r.seconds);
  const i = at < 0 ? list.length : at;
  if (i >= RECORDS_MAX) return null;
  list.splice(i, 0, { seconds: r.seconds, hits: r.hits, attacks: r.attacks, secret: r.secret, date: r.date });
  try {
    s.setItem(SAVE.records, JSON.stringify(list.slice(0, RECORDS_MAX)));
  } catch {
    return null; // приватный режим или нет места — игра идёт, места нет
  }
  return i + 1;
}
