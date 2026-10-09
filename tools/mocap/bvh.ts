export type Vec3 = [number, number, number];

export interface BvhJoint {
  name: string;
  offset: Vec3;
  channels: string[];
  children: number[];
  parent: number; // −1 у корня
  endSite: Vec3 | null;
  channelStart: number; // индекс первого канала сустава в строке кадра
}

export interface Bvh {
  joints: BvhJoint[]; // в порядке обхода: родитель раньше детей
  frameTime: number;
  frames: number[][];
}

export function parseBvh(text: string): Bvh {
  const tok = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const next = () => tok[i++];
  const expect = (w: string) => {
    const t = next();
    if (t !== w) throw new Error(`BVH: ожидалось ${w}, а встретилось ${t}`);
  };
  const vec = (): Vec3 => [Number(next()), Number(next()), Number(next())];
  const joints: BvhJoint[] = [];
  let channelCount = 0;

  function joint(parent: number): number {
    const kw = next();
    if (kw !== 'ROOT' && kw !== 'JOINT') throw new Error(`BVH: ожидался ROOT или JOINT, а встретилось ${kw}`);
    const name = next();
    expect('{');
    expect('OFFSET');
    const offset = vec();
    expect('CHANNELS');
    const n = Number(next());
    const channels = Array.from({ length: n }, () => next());
    const idx = joints.length;
    joints.push({ name, offset, channels, children: [], parent, endSite: null, channelStart: channelCount });
    channelCount += n;
    for (;;) {
      const t = tok[i];
      if (t === 'JOINT') {
        joints[idx].children.push(joint(idx));
      } else if (t === 'End') {
        i++;
        expect('Site');
        expect('{');
        expect('OFFSET');
        joints[idx].endSite = vec();
        expect('}');
      } else if (t === '}') {
        i++;
        return idx;
      } else {
        throw new Error(`BVH: неожиданный токен ${t}`);
      }
    }
  }

  expect('HIERARCHY');
  joint(-1);
  expect('MOTION');
  expect('Frames:');
  const count = Number(next());
  expect('Frame');
  expect('Time:');
  const frameTime = Number(next());
  const frames: number[][] = [];
  for (let f = 0; f < count; f++) {
    const row = tok.slice(i, i + channelCount).map(Number);
    if (row.length !== channelCount || row.some(v => !Number.isFinite(v))) throw new Error(`BVH: кадр ${f} неполный`);
    frames.push(row);
    i += channelCount;
  }
  return { joints, frameTime, frames };
}

export function jointIndex(bvh: Bvh, name: string): number {
  const k = bvh.joints.findIndex(j => j.name === name);
  if (k < 0) throw new Error(`BVH: нет сустава ${name}`);
  return k;
}

// Матрицы 4×4 построчно, векторы-столбцы.
type M = number[];

function mul(a: M, b: M): M {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return o;
}

const trans = (x: number, y: number, z: number): M => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];

function rot(axis: string, deg: number): M {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  if (axis === 'X') return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
  if (axis === 'Y') return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

const apply = (m: M, p: Vec3): Vec3 => [
  m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
  m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
  m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
];

// Каналы применяются в порядке, в котором перечислены в файле.
export function framePositions(bvh: Bvh, frame: number): { joints: Vec3[]; ends: (Vec3 | null)[] } {
  const row = bvh.frames[frame];
  const world: M[] = [];
  const joints: Vec3[] = [];
  const ends: (Vec3 | null)[] = [];
  bvh.joints.forEach((j, k) => {
    let local = trans(...j.offset);
    j.channels.forEach((ch, c) => {
      const v = row[j.channelStart + c];
      const axis = ch[0];
      local = mul(local, ch.endsWith('position') ? trans(axis === 'X' ? v : 0, axis === 'Y' ? v : 0, axis === 'Z' ? v : 0) : rot(axis, v));
    });
    const w = j.parent < 0 ? local : mul(world[j.parent], local);
    world[k] = w;
    joints.push([w[3], w[7], w[11]]);
    ends.push(j.endSite ? apply(w, j.endSite) : null);
  });
  return { joints, ends };
}
