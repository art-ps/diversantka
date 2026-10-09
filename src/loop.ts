export const MAX_FRAME = 0.25;

// Сколько шагов симуляции сделать за кадр; остаток копится до следующего кадра.
export function planSteps(acc: number, frameSec: number, dt: number): { steps: number; acc: number } {
  let a = acc + Math.min(frameSec, MAX_FRAME);
  let steps = 0;
  while (a >= dt - 1e-9) {
    a -= dt;
    steps++;
  }
  return { steps, acc: Math.max(0, a) };
}
