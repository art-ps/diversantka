# Отложено после плана 6.2 (склейка генератора с миссиями)

## Что сделано

**Задача 1: ввод `levels.ts` и `MissionDef`**
- Новый модуль `src/levels.ts`: `missionDef(n)` возвращает ручную миссию для 1–2 или сгенерированный `LevelDef` для n ≥ 3; `worldOf(n)` кэширует `.rooms`.
- Цикл импортов разорван: `missions` — лист, `levels` импортирует `gen`, `world`, `missions`.
- Структура `MissionDef` = `{ start, time, goal, tapes }` (поле `rooms` убрано).

**Задача 2: миссия и тесты (HUD, ленты, история)**
- `Mission.tapesNeed` — число лент для целей; `createMission(…, tapesNeed)` устанавливает.
- HUD показывает `n/tapesNeed`, итоги и всплывающая `tapeFloat` используют `def.tapes`.
- Сцена приезда `createArrival(rooms, n)` генерируется под номер уровня; забор (`fenceLive`) показывается для лент после сцены.

**Задача 3: стартовый экран (листание, сохранения, `replayOld`)**
- Повтор при удержании: `Game.menuHold = { dir, t }`; первый шаг за `TITLE.repeatDelay`, дальше каждый `TITLE.repeatEvery`.
- `missionName(n, goal)` под строкой миссии; `titleTaskGen(goal, tapes, минуты)` для уровней ≥ 3.
- `Game.replayOld` флаг для чужой версии генератора (из `?r=` при `ReplayVersionError`).

**Задача 4: строка итога и легенда карты**
- `resultLine(…, no?)` — пятый параметр номер миссии; вызовы через `missionResult(m, now, no = g.missionId)`.
- `goalLine(g)` объединяет логику целей: 1 = null, bomb до закладки = `goalBomb`/`goalPlant`, ленты = `goalTapes`→`goalComputer`→`goalSwitch`→`goalEscape`.
- Легенда: `mapLegendGen` для сгенерированного bomb, `mapLegend` для лент.

**Задача 5: запись реплеев версии 3**
- Байт версии `3`, varint номера; лент `GEN.version` сохраняется; чужая версия → `ReplayVersionError` при загрузке.

**Задача 6: проверка генератора при запуске; бэклог**
- `main.ts` вызывает `worldOf(1)`, `worldOf(2)`, `worldOf(3)` при загрузке — ошибки шаблонов видны сразу.

## Решения (Ruling)

1. **`src/levels.ts` — разорывает цикл импортов**: вынесены `missionDef` и `worldOf` из `world/index.ts`; `loadWorld(n)` остаётся для 1 и 2.
2. **`MissionDef` структура**: `start`, `time`, `goal`, `tapes` (без `rooms`); совпадает с `LevelDef` генератора.
3. **Число лент — в объекте миссии**: `Mission.tapesNeed` читается в HUD, `enterTapes`, `missionResult`, `tapeFloat`.
4. **Строка итога обобщена**: пятый параметр `no` в `resultLine`; вызовы передают `g.missionId`.
5. **Повтор на стартовом экране**: `Game.menuHold` отслеживает удержание влево/вправо; `TITLE.repeatDelay = 0.4` с, `TITLE.repeatEvery = 0.08` с.
6. **Имя миссии под строкой**: `missionName(n, goal)` вычисляется для ≥ 3; при `unlocked > 2` строка меняется с `МИССИЯ  1 · 2` на `МИССИЯ  < 7 >`.
7. **Единая функция целей**: `goalLine(g)` кэширует логику для всех типов (bomb, ленты); легенда в `map.ts` — отдельная строка.
8. **Легенды карты**: `mapLegend2` для миссии 2, `mapLegendGen` для сгенерированного bomb, `mapLegend` для лент.
9. **Забор на сгенерированных лентах**: `fenceLive` после сцены приезда, как у миссии 1.
10. **Огонь и мотоцикл**: по цели и номеру, не по «миссия 2»; фара вправо для всех n ≥ 2.
11. **Проверка при запуске**: `worldOf(1,2,3)` в `main.ts` ловит ошибки шаблонов на старте.
12. **Флаг чужой версии**: `Game.replayOld` ставит `main.ts`, рисует стартовый экран; новая игра (`become`) флаг не переносит.

Ruling (T1): tests/missions.test.ts ожидает MISSIONS без `rooms`, с `tapes 6/0` — следует из плана.
Ruling (T2): проверка HUD `n/tapesNeed` перенесена до startBike; смысл сохранён.
Ruling (T3): третий параметр `missionResult` убран из теста плана (дефект порядка).
Ruling (T6): ручная проверка в браузере делает контроллер через Chrome после коммита.

## Минор (отложено)

T1:
- levels.test.ts filler `expect(DT)>0` (план-мандат).
- `missionDef`/`worldOf` без проверки `n ≥ 1` целое (вход `?r=` — задача 5).
- game.ts:103 комментарий «MISSIONS[missionId]» устаревший.

T2:
- fence block гвардируется `missionId>=3`, а не `goal==='tapes'` (шаблоны).
- become() комментарий «открытая миссия 2» устаревший.

T3:
- saveWin/SAVE комментарии header не обновлены.
- hold time считается на lang row → нет repeat delay после ↓ при удержании.
- loadLevel принимает '1e21'/'0x10' (hand-edited storage) → hardening `/^\d+$/`.
- saveLevel может понизить level если getItem выбросит, но setItem сработает.

T4:
- Нет теста, закрепляющего `missionId` на вызовах `missionResult` в игре (clip/drawResult/saveWin).
- RED доказательство только текстом.

T5:
- Non-canonical varints приняты; нет positiveraw-v2 миссии 2 теста; replayOld→main не протестирован.

## Для 6б (босс)

Цель `boss` на уровнях 10, 20, 30, …:
- `goalOf` в `src/gen/difficulty.ts` возвращает `'bomb' | 'tapes' | 'boss'`.
- Шаблон `arena` (новый или адаптированный из `vault`): сетка арены без проходов, огонь, центральная ямка.
- `goalLine` для `boss`: `goalBoss` (атака андроида).
- `missionName(n, 'boss')` = `АНДРОИД` (RU) / `ANDROID` (EN).
- `titleTaskGen(n, 'boss', …)` = задача босса (`ПОБЕДИ АНДРОИДА`).
- `mapLegendGen` для `boss` добавляет `А АНДРОИД` (RU) / `A ANDROID` (EN).
- Лимит таймера: ~20 минут; дизайн боя и AI босса — отдельная задача.
