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
