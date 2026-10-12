import { ROOM_W } from '../config';

export type ItemKind = 'knife' | 'stone' | 'wrench';
export const ITEM_KINDS: ItemKind[] = ['knife', 'stone', 'wrench'];

export interface ItemSpawn { kind: ItemKind; x: number; bottom: number }
export interface AndroidSpawn { kind: 'android'; x: number; bottom: number; patrol: [number, number] }
export interface DogSpawn { kind: 'dog'; x: number; bottom: number; patrol: [number, number] }
export interface FlamerSpawn { kind: 'flamer'; x: number; y: number; dir: 1 | -1 } // x — сопло, y — высота струи
export type EnemySpawn = AndroidSpawn | DogSpawn | FlamerSpawn;

const parts = (s: string | undefined) => (s ?? '').split(';').map(p => p.trim()).filter(Boolean);
const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

// «kind@x,bottom»
function at(rec: string): { kind: string; x: number; bottom: number } | null {
  const m = /^([a-z]+)@([^,\s]+),([^,\s]+)/.exec(rec);
  if (!m) return null;
  const x = num(m[2]), bottom = num(m[3]);
  return Number.isFinite(x) && Number.isFinite(bottom) ? { kind: m[1], x, bottom } : null;
}

export interface Point { x: number; bottom: number }

// «x,низ ; x,низ» — ленты, щиток, мотоцикл. what — родительный падеж для ошибки.
export function parsePoints(s: string | undefined, file: string, what: string): Point[] {
  return parts(s).map(rec => {
    const m = /^([^,\s]+),([^,\s]+)$/.exec(rec);
    const x = m ? num(m[1]) : NaN, bottom = m ? num(m[2]) : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(bottom)) throw new Error(`${file}: плохая запись ${what} «${rec}»`);
    return { x, bottom };
  });
}

export const AMBIENTS = ['storm', 'hum', 'drips', 'river', 'wind'] as const;
export type Ambient = (typeof AMBIENTS)[number];

// «ambient: слово» — звуковой фон комнаты; пусто — без фона, чужое слово — ошибка.
export function parseAmbient(s: string | undefined, file: string): Ambient | null {
  const v = (s ?? '').trim();
  if (!v) return null;
  if (!(AMBIENTS as readonly string[]).includes(v)) throw new Error(`${file}: неизвестный фон «${v}»`);
  return v as Ambient;
}

export interface Fence { x: number; top: number; bottom: number }

// «x,верх..низ» — столбец забора в клетках.
export function parseFence(s: string | undefined, file: string): Fence | null {
  const v = (s ?? '').trim();
  if (!v) return null;
  const m = /^(\d+),(\d+)\.\.(\d+)$/.exec(v);
  if (!m || Number(m[2]) > Number(m[3])) throw new Error(`${file}: плохая запись забора «${v}»`);
  return { x: Number(m[1]), top: Number(m[2]), bottom: Number(m[3]) };
}

export interface LiftSpawn { x: number; stops: number[] }

// «x верх..низ floors=a,b» — лифт: платформа в колонках x..x+2; этажи (верх платформы) — верх, низ и floors между ними,
// по возрастанию. Строки больше 24 — в комнатах ниже по выходам down (25 — строка 0 следующей).
export function parseLift(s: string | undefined, file: string): LiftSpawn | null {
  const v = (s ?? '').trim();
  if (!v) return null;
  const m = /^(\d+)\s+(\d+)\.\.(\d+)(?:\s+floors=(\d+(?:,\d+)*))?$/.exec(v);
  const x = m ? Number(m[1]) : NaN, top = m ? Number(m[2]) : NaN, bottom = m ? Number(m[3]) : NaN;
  const floors = m?.[4] ? m[4].split(',').map(Number) : [];
  if (!m || x > ROOM_W - 3 || !(top < bottom) || floors.some(f => f <= top || f >= bottom)) throw new Error(`${file}: плохая запись лифта «${v}»`);
  return { x, stops: [...new Set([top, ...floors, bottom])].sort((a, b) => a - b) };
}

export interface TerminalSpawn { x: number; bottom: number; controls: string[]; main: boolean }

// «x,низ controls=a,b» — гасит огнемёты комнат a, b; «x,низ main» — главная ЭВМ.
export function parseTerminals(s: string | undefined, file: string): TerminalSpawn[] {
  return parts(s).map(rec => {
    const [pos, ...opts] = rec.split(/\s+/);
    const [p] = parsePoints(pos, file, 'терминала');
    let controls: string[] = [];
    let main = false;
    for (const o of opts) {
      if (o === 'main') main = true;
      else if (/^controls=[^,]+(,[^,]+)*$/.test(o)) controls = o.slice('controls='.length).split(',');
      else throw new Error(`${file}: у терминала непонятное «${o}»`);
    }
    return { ...p, controls, main };
  });
}

export function parseItems(s: string | undefined, file: string): ItemSpawn[] {
  return parts(s).map(rec => {
    const kind = /^([a-z]+)@/.exec(rec)?.[1];
    if (kind && !ITEM_KINDS.includes(kind as ItemKind)) throw new Error(`${file}: неизвестный предмет «${kind}»`);
    const p = at(rec);
    if (!p) throw new Error(`${file}: плохая запись предмета «${rec}»`);
    return { kind: p.kind as ItemKind, x: p.x, bottom: p.bottom };
  });
}

const NAMES = { android: 'андроид', dog: 'собака' } as const;
const GEN = { android: 'у андроида', dog: 'у собаки' } as const;

function patrolOf(rec: string, file: string, kind: 'android' | 'dog', x: number): [number, number] {
  const m = /patrol=([\d.]+)\.\.([\d.]+)/.exec(rec);
  if (!m) throw new Error(`${file}: ${GEN[kind]} нет patrol=a..b`);
  const a = Number(m[1]), b = Number(m[2]);
  if (!(a < b) || x < a || x > b) throw new Error(`${file}: ${NAMES[kind]} стоит вне своего участка ${m[1]}..${m[2]}`);
  return [a, b];
}

export function parseEnemies(s: string | undefined, file: string): EnemySpawn[] {
  return parts(s).map((rec): EnemySpawn => {
    const kind = /^([a-z]+)@/.exec(rec)?.[1];
    if (kind !== 'android' && kind !== 'dog' && kind !== 'flamer') throw new Error(`${file}: неизвестный враг «${kind ?? rec}»`);
    const p = at(rec);
    if (!p) throw new Error(`${file}: плохая запись врага «${rec}»`);
    if (kind === 'flamer') {
      const d = /dir=(left|right)/.exec(rec)?.[1];
      if (!d) throw new Error(`${file}: у огнемёта нет dir=left|right`);
      return { kind, x: p.x, y: p.bottom, dir: d === 'left' ? -1 : 1 };
    }
    return { kind, x: p.x, bottom: p.bottom, patrol: patrolOf(rec, file, kind, p.x) };
  });
}
