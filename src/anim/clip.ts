// Скелет в боковой проекции: x вперёд по взгляду, y вверх, клетки, (0,0) — земля под тазом.
export const JOINTS = [
  'head', 'neck', 'pelvis',
  'lShoulder', 'lElbow', 'lHand',
  'rShoulder', 'rElbow', 'rHand',
  'lKnee', 'lFoot', 'rKnee', 'rFoot',
] as const;

export type JointName = (typeof JOINTS)[number];

export const J = Object.fromEntries(JOINTS.map((n, i) => [n, i])) as Record<JointName, number>;

export const BONES: [JointName, JointName][] = [
  ['head', 'neck'], ['neck', 'pelvis'],
  ['neck', 'lShoulder'], ['lShoulder', 'lElbow'], ['lElbow', 'lHand'],
  ['neck', 'rShoulder'], ['rShoulder', 'rElbow'], ['rElbow', 'rHand'],
  ['pelvis', 'lKnee'], ['lKnee', 'lFoot'],
  ['pelvis', 'rKnee'], ['rKnee', 'rFoot'],
];

export type Pose = number[]; // x0, y0, x1, y1, … — 26 чисел

export interface Clip {
  name: string;
  fps: number;
  loop: boolean;
  speed: number; // путь таза по горизонтали в исходной записи, клеток/с
  frames: Pose[];
  contacts: number[]; // бит 1 — левая стопа на земле, бит 2 — правая
}

export function poseDistance(a: Pose, b: Pose): number {
  let d = 0;
  for (let i = 0; i < a.length; i += 2) d = Math.max(d, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]));
  return d;
}

export function validateClip(c: unknown): string[] {
  const k = c as Clip;
  const name = typeof k?.name === 'string' ? k.name : '?';
  const errors: string[] = [];
  if (!(k?.fps > 0)) errors.push(`${name}: fps должен быть > 0`);
  if (!Number.isFinite(k?.speed) || k.speed < 0) errors.push(`${name}: speed должен быть ≥ 0`);
  if (!Array.isArray(k?.frames) || k.frames.length === 0) errors.push(`${name}: нет кадров`);
  else k.frames.forEach((f, i) => {
    if (!Array.isArray(f) || f.length !== JOINTS.length * 2 || !f.every(Number.isFinite)) errors.push(`${name}: кадр ${i} — не 26 чисел`);
  });
  if (!Array.isArray(k?.contacts) || k.contacts.length !== (k?.frames?.length ?? -1)) errors.push(`${name}: contacts не совпадает с числом кадров`);
  return errors;
}
