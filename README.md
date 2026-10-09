# Диверсантка

Браузерный ASCII-платформер со светящимися символами. Оммаж Saboteur II (ZX Spectrum, 1987):
свой сюжет, карта и графика, общие только жанр и механики.

- `npm run dev` — запуск
- `npm test` — тесты
- `npm run build` — сборка

Управление: стрелки/WASD, Пробел — прыжок, J — удар, K — бросок, E — терминал, Esc — пауза,
B — свечение вкл/выкл, F — полный экран. Геймпад: стандартная раскладка.

## Движения

Позы героини построены по базе захвата движений CMU. The data used in this project was obtained from mocap.cs.cmu.edu.
The database was created with funding from NSF EIA-0196217. BVH-конвертация — Bruce Hahne (cgspeed).
Исходные файлы в репозиторий не входят: `npm run mocap:fetch` скачивает их, `npm run mocap:build` собирает `anim/*.json`.

## Огонь и эффекты

Поле жара, дым, помехи и рябь — по мотивам анимаций [ascii.rest](https://github.com/bas3line/ascii) (© 2026 bas3line, MIT, см. `third_party/ascii.rest-LICENSE`).
