import { expect, it } from 'vitest';
import { GEN } from '../src/config';
import { generateLevel } from '../src/gen/level';

// FNV-1a по строке (UTF-16 единицы).
function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

it('отпечаток уровней 3…12: изменился генератор, шаблоны или числа GEN — подними GEN.version и обнови отпечаток', () => {
  let text = '';
  for (let n = 3; n <= 12; n++) {
    const lv = generateLevel(n);
    text += JSON.stringify([[...lv.rooms], lv.def]);
  }
  expect(
    { version: GEN.version, hash: fnv(text) },
    'изменился генератор, шаблоны или числа GEN — подними GEN.version и обнови отпечаток (реплеи прошлой версии станут другими)',
  ).toEqual({ version: 2, hash: 43991358 });
});

it('зеркало не оставляет meta.slots', async () => {
  const { loadTemplates } = await import('../src/gen/templates');
  const ts = loadTemplates();
  for (const t of ts.filter(x => x.id.endsWith('~m'))) expect(t.meta.slots).toBeUndefined();
});
