# Охранник вскидывает ружьё к плечу — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** при прицеле/перезарядке ружьё охранника и его пуля на высоте плеча, а не пояса.

**Architecture:** одна константа `GUARD.chest` задаёт высоту кисти, пули и проверки видимости — меняем её; в `raiseRifle` опускаем локоть, чтобы рука была согнута.

**Tech Stack:** TypeScript, vitest (`npm test`, `npm run typecheck`).

**Spec:** `docs/specs/2026-11-06-guard-rifle-shoulder.md`

## Global Constraints

- `GUARD.chest = 3.1`, имя не меняется, комментарий — «плечо».
- Локоть в `raiseRifle`: x — среднее плеча и кисти, y — среднее минус 0.3.
- Клипы анимаций, скорость/урон пули, андроиды — не трогать.
- Коммиты без трейлера `Co-Authored-By`.

## Review Focus

- Взгляд −1: ствол тоже на уровне плеча — покрыто существующим циклом по facing в `guard-aim.test.ts` (ствол на `bottom − GUARD.chest`).
- `patrol`: ружьё у опущенной руки — существующий тест `patrol: ружьё у опущенной руки` должен остаться зелёным.
- Пригнувшаяся героиня не получает пулю — новый тест в Task 1.

---

### Task 1: ружьё и пуля на высоте плеча

**Files:**
- Modify: `src/config.ts:88` (`GUARD.chest`)
- Modify: `src/render/scene.ts:258-268` (`raiseRifle` — экспортировать, опустить локоть)
- Test: `tests/guard-aim.test.ts`, `tests/guard.test.ts`

**Interfaces:**
- Produces: `export function raiseRifle(pose: number[]): number[]` из `src/render/scene.ts` (только для теста; поведение кисти прежнее).

- [ ] **Step 1: Тесты (падают)**

В `tests/guard-aim.test.ts` (импорты `simplePose` из `../src/anim/simple`, `CLIPS` из `../src/anim/clips`, `J` из `../src/anim/clip`, `raiseRifle` из `../src/render/scene`):

```ts
it('aim: ствол на уровне правого плеча позы', () => {
  const { gun, gd, bottom } = draw('aim', 1);
  const shoulder = simplePose(gd.anim, CLIPS)[2 * J.rShoulder + 1];
  for (const [, y] of gun) expect(Math.abs(bottom - y - shoulder)).toBeLessThanOrEqual(0.3);
});

it('aim: рука согнута — локоть ниже кисти', () => {
  const { gd } = draw('aim', 1);
  const p = raiseRifle(simplePose(gd.anim, CLIPS));
  expect(p[2 * J.rHand + 1] - p[2 * J.rElbow + 1]).toBeGreaterThanOrEqual(0.2);
});
```

В `tests/guard.test.ts`, в `describe` с пулями:

```ts
it('пуля проходит над пригнувшейся героиней и попадает в стоящую', () => {
  const crouched = ninaAt(30);
  for (let i = 0; i < 10; i++) updateNina(crouched, { ...IDLE, down: true }, ROOM, DT);
  expect(crouched.crouching).toBe(true);
  const a = untilShot(guard(20), crouched).p!;
  expect(flies(a, crouched)).toBe(false);
  const standing = ninaAt(30);
  const b = untilShot(guard(20), standing).p!;
  expect(flies(b, standing)).toBe(true);
});
```

- [ ] **Step 2:** `npx vitest run tests/guard-aim.test.ts tests/guard.test.ts` — новые «плечо» и «локоть» FAIL (тест пули может пройти и на старом значении — это нормально, он фиксирует поведение).

- [ ] **Step 3:** `GUARD.chest: 3.1` с комментарием «пуля и вскинутое ружьё на высоте низ тела − chest — плечо стоящей героини»; `raiseRifle` экспортировать, локоть `y = (sy + hy) / 2 - 0.3`, комментарий над функцией поправить («на высоте плеча», «локоть ниже — рука согнута»).

- [ ] **Step 4:** `npm test` и `npm run typecheck` — всё зелёное.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/render/scene.ts tests/guard-aim.test.ts tests/guard.test.ts
git commit -m "fix: охранник вскидывает ружьё к плечу, пуля на высоте плеча"
```
