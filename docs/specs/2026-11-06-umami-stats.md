# Статистика Umami

## Зачем

Видеть заходы на сайт с игрой и что игроки делают: начали миссию, прошли, погибли. Как в siply и tetris-rl-web — свой Umami на `stats.pisarev.me`.

## Контракт

1. `index.html`, в `<head>`:
   `<script defer src="https://stats.pisarev.me/script.js" data-website-id="9f4a9c1b-d0ad-4f31-a4f8-f1f9a875d86a"></script>`
   Просмотры страницы Umami считает сам.
2. События через `window.umami.track(name, { mission })`, `mission` — номер миссии (`game.missionId`):
   - `mission-start` — пошёл таймер миссии: нет пролога (`game.prologue === null`) и нет сцены приезда (`game.arrival === null`), объект `game.mission` новый. Повтор после гибели — тоже старт (считаем попытки).
   - `mission-win` — `game.mission.result === 'won'`, раз на объект миссии.
   - `mission-death` — `game.nina.dead` стало true, раз на объект героини.
   - `mission-fail` — `game.mission.result === 'failed'` (время вышло, бомба взорвалась), раз на объект миссии; не шлётся, если в этой миссии уже ушло `mission-death`.
3. Реплей по ссылке (`game.replay` / `replay !== null` в `main.ts`) — ничего не шлёт.
4. Нет `window.umami` (скрипт не загрузился, блокировщик) — событие молча теряется, игра идёт как обычно; исключение из `track` не роняет кадр.

## Приёмка (тесты)

Чистая функция над состоянием игры, тесты на неё:
1. Старт миссии 1 после пролога — одно `mission-start {mission: 1}`; повторные кадры — ничего.
2. Пока идёт пролог или сцена приезда — `mission-start` нет; после конца сцены приезда — есть.
3. Победа — одно `mission-win`, на следующих кадрах ничего.
4. Гибель — одно `mission-death`; если потом `result = 'failed'` в той же миссии — `mission-fail` не шлётся.
5. Время вышло без гибели — одно `mission-fail`.
6. Новая игра после гибели (новый объект миссии) — снова `mission-start`.
7. `npm test`, `npm run typecheck`, `npm run build` — зелёные; в `dist/index.html` есть тег скрипта с этим website-id.

## Не трогаем

Другие события (подбор лент, пауза, выбор языка), идентификацию игроков, cookie-баннер (Umami без cookie), реплей.
