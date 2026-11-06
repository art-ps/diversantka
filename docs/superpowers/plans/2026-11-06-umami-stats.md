# Статистика Umami — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** заходы на сайт и события миссий (старт, победа, гибель, провал) в Umami.

**Architecture:** тег скрипта Umami в `index.html`; чистая функция `statsEvents` в новом `src/stats.ts` по состоянию игры решает, какие события ушли в этом кадре (помнит уже отправленные по ссылкам на объекты); `main.ts` раз за кадр зовёт её и шлёт в `window.umami?.track`, кроме реплея.

**Tech Stack:** TypeScript, Vite, vitest.

**Spec:** `docs/specs/2026-11-06-umami-stats.md`

## Global Constraints

- website-id `9f4a9c1b-d0ad-4f31-a4f8-f1f9a875d86a`, скрипт `https://stats.pisarev.me/script.js`, `defer`.
- Имена событий: `mission-start`, `mission-win`, `mission-death`, `mission-fail`; данные — `{ mission: game.missionId }`.
- Без новых зависимостей. Комментарии — по-русски, кратко, как в соседнем коде.
- Коммиты без трейлера `Co-Authored-By`.

## Review Focus

- Реплей не шлёт ничего — проверяется в `main.ts` (ветка `replay`), тестом не покрыто; ревьюер смотрит глазами.
- `window.umami` нет или `track` бросает — кадр не падает (`try/catch` вокруг вызова, как у звука в `main.ts`).
- Победа и следующая миссия: после `mission-win` сцена приезда новой миссии, затем её `mission-start` — покрыто тестами 2 и 6.

---

### Task 1: события Umami

**Files:**
- Create: `src/stats.ts`
- Modify: `index.html` (тег скрипта в `<head>`), `src/main.ts` (вызов раз за кадр после цикла шагов)
- Test: `tests/stats.test.ts`

**Interfaces:**
- Produces:
  - `export type StatsEvent = { name: 'mission-start' | 'mission-win' | 'mission-death' | 'mission-fail'; data: { mission: number } }`
  - `export type StatsSeen = { started: WeakSet<object>; ended: WeakSet<object>; dead: WeakSet<object>; diedIn: WeakSet<object> }` и `export const createStatsSeen = (): StatsSeen`
  - `export function statsEvents(g: Game, seen: StatsSeen): StatsEvent[]` — ключи: `g.mission` (started, ended, diedIn), `g.nina` (dead).
  - `declare global { interface Window { umami?: { track(name: string, data?: Record<string, unknown>): void } } }`

- [ ] **Step 1: Тесты (падают)** в `tests/stats.test.ts`. Игру строить через `startMission(n, false)` / `createGame` из `src/game.ts` и шагами `stepGame` либо прямой правкой полей (`g.prologue = null`, `g.arrival = null`, `g.mission.result = 'won'`, `g.nina.dead = true`, подмена `g.mission`/`g.nina` новыми объектами через новую игру) — что проще и честно отражает состояние. Кейсы — ровно пункты 1–6 приёмки spec, с проверкой `toEqual` на точный список событий за кадр, напр. `expect(statsEvents(g, seen)).toEqual([{ name: 'mission-start', data: { mission: 1 } }])`, а второй вызов — `toEqual([])`.

- [ ] **Step 2:** `npx vitest run tests/stats.test.ts` — FAIL (модуля нет).

- [ ] **Step 3:** `src/stats.ts` по Interfaces. Порядок в одном кадре: start, death, затем win/fail.

- [ ] **Step 4:** `main.ts`: `const seen = createStatsSeen()` рядом с `saved`; после цикла шагов: `if (!replay) for (const e of statsEvents(game, seen)) try { window.umami?.track(e.name, e.data); } catch { /* статистика не должна ронять кадр */ }`. `index.html`: тег из Global Constraints после `<title>`.

- [ ] **Step 5:** `npm test`, `npm run typecheck`, `npm run build`; `grep 9f4a9c1b dist/index.html` — тег на месте.

- [ ] **Step 6: Commit**

```bash
git add index.html src/stats.ts src/main.ts tests/stats.test.ts
git commit -m "feat: статистика Umami — заходы и события миссий"
```
