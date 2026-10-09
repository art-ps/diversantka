import type { Clip } from './clip';

const files = import.meta.glob('../../anim/*.json', { import: 'default', eager: true }) as Record<string, Clip>;

export const CLIPS = new Map(Object.values(files).map(c => [c.name, c]));
