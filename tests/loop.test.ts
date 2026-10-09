import { expect, it } from 'vitest';
import { planSteps } from '../src/loop';

const DT = 1 / 60;

it('после долгой паузы не больше 15 шагов', () => {
  expect(planSteps(0, 60, DT).steps).toBe(15);
});

it('на 120 Гц шаг случается раз в два кадра', () => {
  const a = planSteps(0, 1 / 120, DT);
  expect(a.steps).toBe(0);
  expect(planSteps(a.acc, 1 / 120, DT).steps).toBe(1);
});
