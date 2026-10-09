export type ItemKind = 'knife' | 'stone' | 'wrench';
export const ITEM_KINDS: ItemKind[] = ['knife', 'stone', 'wrench'];

export interface ItemSpawn { kind: ItemKind; x: number; bottom: number }
export interface EnemySpawn { kind: 'android'; x: number; bottom: number; patrol: [number, number] }

const parts = (s: string | undefined) => (s ?? '').split(';').map(p => p.trim()).filter(Boolean);
const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

// «kind@x,bottom»
function at(rec: string): { kind: string; x: number; bottom: number } | null {
  const m = /^([a-z]+)@([^,\s]+),([^,\s]+)/.exec(rec);
  if (!m) return null;
  const x = num(m[2]), bottom = num(m[3]);
  return Number.isFinite(x) && Number.isFinite(bottom) ? { kind: m[1], x, bottom } : null;
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

export function parseEnemies(s: string | undefined, file: string): EnemySpawn[] {
  return parts(s).map(rec => {
    const kind = /^([a-z]+)@/.exec(rec)?.[1];
    if (kind !== 'android') throw new Error(`${file}: неизвестный враг «${kind ?? rec}»`);
    const p = at(rec);
    if (!p) throw new Error(`${file}: плохая запись врага «${rec}»`);
    const m = /patrol=([\d.]+)\.\.([\d.]+)/.exec(rec);
    if (!m) throw new Error(`${file}: у андроида нет patrol=a..b`);
    const a = Number(m[1]), b = Number(m[2]);
    if (!(a < b) || p.x < a || p.x > b) throw new Error(`${file}: андроид стоит вне своего участка ${m[1]}..${m[2]}`);
    return { kind: 'android', x: p.x, bottom: p.bottom, patrol: [a, b] };
  });
}
