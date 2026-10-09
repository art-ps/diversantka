// node tools/mocap/cli.ts inspect 16_35   — таблица по кадрам для выбора диапазона
// node tools/mocap/cli.ts build           — собрать anim/*.json по clips.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { validateClip } from '../../src/anim/clip.ts';
import { NINA } from '../../src/config.ts';
import { framePositions, jointIndex, parseBvh, type Bvh } from './bvh.ts';
import { convertClip, type ClipSpec } from './convert.ts';

const CACHE = 'tools/mocap/.cache';
const FPS = 30;

const load = (id: string): Bvh => parseBvh(readFileSync(`${CACHE}/${id}.bvh`, 'utf8'));

function inspect(id: string): void {
  const b = load(id);
  const [hips, lf, rf, head] = ['Hips', 'LeftFoot', 'RightFoot', 'Head'].map(n => jointIndex(b, n));
  const every = Math.max(1, Math.round(0.1 / b.frameTime));
  console.log(`${id}: ${b.frames.length} кадров, ${Math.round(1 / b.frameTime)} к/с; строки — каждые 0,1 с`);
  console.log('кадр\tвремя\tтаз_y\tлев_y\tправ_y\tголова_y\tтаз_z');
  for (let f = 1; f < b.frames.length; f += every) {
    const p = framePositions(b, f).joints;
    const r = (v: number) => v.toFixed(1);
    console.log([f, (f * b.frameTime).toFixed(2), r(p[hips][1]), r(p[lf][1]), r(p[rf][1]), r(p[head][1]), r(p[hips][2])].join('\t'));
  }
}

function build(): void {
  const specs = JSON.parse(readFileSync('tools/mocap/clips.json', 'utf8')) as ClipSpec[];
  mkdirSync('anim', { recursive: true });
  for (const spec of specs) {
    const clip = convertClip(load(spec.source), spec, { height: NINA.h, fps: FPS });
    const errors = validateClip(clip);
    if (errors.length) throw new Error(errors.join('\n'));
    writeFileSync(`anim/${spec.name}.json`, JSON.stringify(clip) + '\n');
    console.log(`${spec.name}: ${clip.frames.length} кадров, скорость ${clip.speed} кл/с, ${spec.source} ${spec.from}..${spec.to}`);
  }
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'inspect' && arg) inspect(arg);
else if (cmd === 'build') build();
else {
  console.error('использование: node tools/mocap/cli.ts inspect <id> | build');
  process.exit(1);
}
