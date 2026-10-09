import type { Clip } from './clip';
import { makeCrouchKick } from './derived';

const files = import.meta.glob('../../anim/*.json', { import: 'default', eager: true }) as Record<string, Clip>;

export const CLIPS = new Map(Object.values(files).map(c => [c.name, c]));

// Удар сидя собирается из позы приседа — в базе движений нет подходящей записи.
const crouch = CLIPS.get('crouch');
if (crouch) CLIPS.set('crouchkick', makeCrouchKick(crouch));
