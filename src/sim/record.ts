import { IDLE, type Intent } from '../input/intent';
import { GEN } from '../config';
import type { MissionNo } from '../missions';

// Запись нажатий: по числу на шаг симуляции. Биты 0–8 — флаги в порядке FLAGS, с бита 9 — moveX в сотых
// со сдвигом +100 (0…200): стик геймпада аналоговый, мир видит ровно то, что записано (stepGame квантует).
const FLAGS = ['up', 'down', 'jump', 'jumpPressed', 'attackPressed', 'throwPressed', 'usePressed', 'upPressed', 'downPressed'] as const;
const MX_SHIFT = FLAGS.length;
const MX_ZERO = 100;
const IDLE_CODE = MX_ZERO * (1 << MX_SHIFT);
const MAX_CODE = (2 * MX_ZERO + 1) * (1 << MX_SHIFT) - 1; // moveX 200 и все флаги

export function encodeIntent(it: Intent): number {
  let code = 0;
  FLAGS.forEach((f, i) => { if (it[f]) code |= 1 << i; });
  const mx = Math.round(Math.min(1, Math.max(-1, Number.isFinite(it.moveX) ? it.moveX : 0)) * MX_ZERO) + MX_ZERO;
  return code + mx * (1 << MX_SHIFT);
}

// Кривой код (чужая или испорченная запись) не бросает: код вне 17 бит — покой, moveX вне −1…1 — ноль.
export function decodeIntent(code: number): Intent {
  const c = Number.isInteger(code) && code >= 0 && code <= MAX_CODE ? code : IDLE_CODE;
  const mx = Math.floor(c / (1 << MX_SHIFT));
  const flag = (i: number) => (c & (1 << i)) !== 0;
  return {
    moveX: mx <= 2 * MX_ZERO ? (mx - MX_ZERO) / MX_ZERO : 0,
    up: flag(0), down: flag(1), jump: flag(2),
    jumpPressed: flag(3), attackPressed: flag(4), throwPressed: flag(5), usePressed: flag(6), pausePressed: false,
    upPressed: flag(7), downPressed: flag(8),
  };
}

// Сериализация для ссылки: байт версии, затем номер миссии varint и у сгенерированных (с 3-й) — байт GEN.version, затем
// deflate-raw от пар varint «значение, длина повтора», затем base64url. Версия 1 (до плана 5в.3) — без номера: миссия 1;
// версия 2 (до плана 6.2) — номер одним байтом, только 1 и 2.
const VERSION = 3;
const MAX_STEPS = 500_000; // больше двух часов при 60 Гц — запись заведомо не наша, память не тратим
const MAX_MISSION = 1_000_000; // номер из ссылки выше — враждебный: генерировать такой уровень игра не пойдёт

// Ссылка записана другой версией генератора: уровень с тем же номером у зрителя другой — реплей не показываем.
export class ReplayVersionError extends Error {
  constructor() {
    super('record: other generator version');
  }
}

function pushVarint(out: number[], n: number): void {
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80);
    n = Math.floor(n / 0x80);
  }
  out.push(n);
}

async function through(bytes: Uint8Array<ArrayBuffer>, t: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(t);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('record: not base64url');
  const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function packRecord(rec: readonly number[], mission: MissionNo = 1): Promise<string> {
  const raw: number[] = [];
  for (let i = 0; i < rec.length;) {
    let j = i + 1;
    while (j < rec.length && rec[j] === rec[i]) j++;
    pushVarint(raw, rec[i]);
    pushVarint(raw, j - i);
    i = j;
  }
  const z = await through(new Uint8Array(raw), new CompressionStream('deflate-raw'));
  const head = [VERSION];
  pushVarint(head, mission);
  if (mission >= 3) head.push(GEN.version);
  const out = new Uint8Array(head.length + z.length);
  out.set(head, 0);
  out.set(z, head.length);
  return toBase64url(out);
}

const MAX_LINK = 200_000;

// Запись и миссия из ссылки. Бросает на любой порче: не base64url, чужая версия записи, номер миссии 0 или выше
// миллиона, другая версия генератора (ReplayVersionError), битый deflate, оборванный varint, слишком длинная запись.
export async function unpackReplay(s: string): Promise<{ rec: number[]; mission: MissionNo }> {
  if (s.length > MAX_LINK) throw new Error('record: too long'); // до декодирования: deflate раздувает ссылку в тысячи раз
  const bytes = fromBase64url(s);
  let mission: number, start: number;
  if (bytes[0] === 1) {
    mission = 1;
    start = 1;
  } else if (bytes[0] === 2) {
    mission = bytes[1];
    start = 2;
    if (mission !== 1 && mission !== 2) throw new Error('record: unknown mission');
  } else if (bytes[0] === VERSION) {
    let p = 1, mul = 1;
    mission = 0;
    for (;;) {
      if (p >= bytes.length || mul > 2 ** 28) throw new Error('record: truncated mission');
      const b = bytes[p++];
      mission += (b & 0x7f) * mul;
      if (b < 0x80) break;
      mul *= 0x80;
    }
    if (mission < 1 || mission > MAX_MISSION) throw new Error('record: unknown mission');
    if (mission >= 3) {
      if (p >= bytes.length) throw new Error('record: truncated mission');
      if (bytes[p++] !== GEN.version) throw new ReplayVersionError();
    }
    start = p;
  } else throw new Error('record: unknown version');
  const raw = await through(bytes.slice(start), new DecompressionStream('deflate-raw'));
  const rec: number[] = [];
  let p = 0;
  const varint = (): number => {
    let n = 0, mul = 1;
    for (;;) {
      if (p >= raw.length || mul > 2 ** 35) throw new Error('record: truncated varint');
      const b = raw[p++];
      n += (b & 0x7f) * mul;
      if (b < 0x80) return n;
      mul *= 0x80;
    }
  };
  while (p < raw.length) {
    const v = varint(), k = varint();
    if (v > MAX_CODE) throw new Error('record: bad code');
    if (k < 1 || rec.length + k > MAX_STEPS) throw new Error('record: bad run length');
    for (let i = 0; i < k; i++) rec.push(v);
  }
  return { rec, mission };
}

// Только шаги записи, без миссии.
export const unpackRecord = async (s: string): Promise<number[]> => (await unpackReplay(s)).rec;

// Ссылка на реплей: текущая страница без query и hash, плюс ?r=. На GitHub Pages, артефакте и локально — своя.
export function replayUrl(href: string, packed: string): string {
  const u = new URL(href);
  u.search = '';
  u.hash = '';
  return `${u.href}?r=${packed}`;
}

// Текст для буфера обмена: строка итога и ссылка на реплей через перевод строки; ссылки нет — только строка.
export const shareText = (line: string, url: string | null): string => (url ? `${line}\n${url}` : line);

// Зритель реплея хочет играть: прыжок, удар, бросок, E или движение. Пауза и вверх/вниз не считаются.
export const quitsReplay = (it: Intent): boolean =>
  it.moveX !== 0 || it.jumpPressed || it.attackPressed || it.throwPressed || it.usePressed;

// Реплей: запись, номер следующего шага и миссия, с начала которой она идёт.
export interface Replay { rec: readonly number[]; i: number; mission: MissionNo }

// Намерение следующего шага реплея. ended — у миссии есть итог: дальше покой (выезд и экран итогов идут сами).
// null — запись кончилась без итога (обрезана или чужая): выход в обычный старт.
export function replayStep(r: Pick<Replay, 'rec' | 'i'>, ended: boolean): Intent | null {
  if (ended) return IDLE;
  if (r.i >= r.rec.length) return null;
  return decodeIntent(r.rec[r.i++]);
}

// После выхода из реплея удерживаемое движение не должно доходить до стартового экрана (там оно переключает язык):
// пока hold и устройство держит moveX — подаём покой по moveX; как только moveX стал 0 — защёлка снята.
export function holdMove(it: Intent, hold: boolean): { it: Intent; hold: boolean } {
  if (!hold || it.moveX === 0) return { it, hold: false };
  return { it: { ...it, moveX: 0 }, hold: true };
}
