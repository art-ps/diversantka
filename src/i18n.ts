import { MISSION } from './config';
import { MISSIONS, type MissionNo } from './missions';

// Языки игры. Порядок — как в строке выбора на стартовом экране.
export type Lang = 'en' | 'ru';
export const LANGS: readonly Lang[] = ['en', 'ru'];
// Названия языков в строке выбора — каждое на своём языке, поэтому вне словаря.
export const LANG_NAMES: Record<Lang, string> = { en: 'ENGLISH', ru: 'РУССКИЙ' };

// Отметки рекорда: без урона (hits = 0), без боя (attacks = 0), источник найден.
export type Mark = 'noDamage' | 'noFight' | 'source';

// Все тексты, которые видит игрок. Функции — тексты с числами и id комнат (id не переводятся).
export interface Strings {
  // HUD и надписи над миром
  energy: string;
  hudTapes: (n: number, total: number) => string;
  hudBomb: (held: boolean) => string; // HUD миссии 2 вместо лент, пока бомба не заложена: в руках или нет
  dead: string;
  credit: string;
  liftHint: string;
  replayHud: string; // справа в HUD вместо id комнаты, пока идёт реплей по ссылке
  missionName: Record<MissionNo, string>; // над миром в сцене приезда
  prologue: Record<'title' | 'fly' | 'fall' | 'splash' | 'crash', string>;
  // всплывающие надписи
  tapeFloat: (n: number, total: number) => string;
  sourceFound: string;
  fenceLive: string;
  killed: string;
  blocked: string;
  needKey: (n: number) => string; // E у запертой двери без её ключа
  needBomb: string; // E у точки закладки без бомбы в руках
  plantFirst: string; // E у мотоцикла, пока бомба не заложена
  hudFuse: (time: string) => string; // HUD вместо таймера миссии, пока идёт отсчёт бомбы
  // миссия: главная ЭВМ, щиток, строка итога для буфера обмена
  notEnoughTapes: (n: number, total: number) => string;
  tapesIn: string;
  accessDenied: string;
  fenceOff: string;
  resultLine: (time: string, tapes: string, hits: number, marks: readonly Mark[]) => string;
  // экран ЭВМ
  bootLog: readonly string[];
  menuFlamer: (room: string) => string;
  menuTapes: string;
  menuExit: string;
  flamerOff: (room: string) => string;
  menuCamera: (room: string) => string;
  cameraOff: (room: string) => string;
  screenHint: string;
  // итог и провал
  won: string;
  resultRows: (time: string, tapes: string, hits: number) => string[];
  marks: Record<Mark, string>; // левая колонка итога, строкой через «·»
  marksShort: Record<Mark, string>; // строки таблицы «ЛУЧШИЕ»
  best: string;
  newRecord: string;
  copyHint: string;
  copiedHint: string;
  failed: string;
  failedHint: string;
  // пауза — карта
  mapTitle: string;
  mapLegend: string;
  mapHint: string;
  mapIcons: Record<'terminal' | 'main' | 'switch' | 'bike', string>;
  // стартовый экран
  titleName: string;
  titleTask: string;
  titleTask2: string; // задача миссии 2 — вместо titleTask, когда на стартовом экране выбрана она
  titleMission: string; // строка выбора миссии «МИССИЯ  1 · 2»
  titleKeys: readonly (readonly [string, string, string])[]; // действие · клавиатура · геймпад; первая строка — шапка
  titleStart: string;
  titleFocus: string;
  // страница без WebGL2 (текст в DOM, не в атласе)
  noWebgl: string;
}

// Отметки в строке для буфера обмена — строчными, как остальная строка.
const LINE_MARKS_RU: Record<Mark, string> = { noDamage: 'без урона', noFight: 'без боя', source: 'источник найден' };
const LINE_MARKS_EN: Record<Mark, string> = { noDamage: 'no damage', noFight: 'no fight', source: 'source found' };

const RU: Strings = {
  energy: 'ЭНЕРГИЯ ',
  hudTapes: (n, total) => `ЛЕНТЫ ${n}/${total} · `,
  hudBomb: held => (held ? 'БОМБА ЕСТЬ · ' : 'БОМБА — · '),
  dead: 'ПОГИБЛА · ПРЫЖОК — ЗАНОВО',
  credit: 'движения: mocap.cs.cmu.edu',
  liftHint: 'E — ВЫЗВАТЬ ЛИФТ',
  replayHud: 'ЗАПИСЬ · ПРОБЕЛ — ИГРАТЬ',
  missionName: { 1: 'МИССИЯ 1 · БАЗА', 2: 'МИССИЯ 2 · БУНКЕР' },
  prologue: { title: '', fly: 'ПРЫЖОК — ОТЦЕПИТЬСЯ', fall: '', splash: 'В МОРЕ · ЗАНОВО', crash: 'УДАР О МАЧТУ · ЗАНОВО' },
  tapeFloat: (n, total) => `ЛЕНТА ${n}/${total}`,
  sourceFound: 'ИСТОЧНИК НАЙДЕН',
  fenceLive: 'ЗАБОР ПОД ТОКОМ',
  killed: 'ВЫВЕДЕН',
  blocked: 'блок',
  needKey: n => `НУЖЕН КЛЮЧ ${n}`,
  needBomb: 'НУЖНА ВЗРЫВЧАТКА',
  plantFirst: 'ЗАЛОЖИ ВЗРЫВЧАТКУ',
  hudFuse: time => `ВЗРЫВ ${time}`,
  notEnoughTapes: (n, total) => `НЕДОСТАТОЧНО ЛЕНТ ${n}/${total}`,
  tapesIn: 'ЛЕНТЫ ВВЕДЕНЫ',
  accessDenied: 'ДОСТУП ЗАКРЫТ',
  fenceOff: 'ЗАБОР ВЫКЛЮЧЕН',
  resultLine: (time, tapes, hits, marks) =>
    ['Диверсантка', time, `ленты ${tapes}`, `ударов ${hits}`, ...marks.map(m => LINE_MARKS_RU[m])].join(' · '),
  bootLog: [
    'НИИ-7 · ЭВМ СЕРИИ 2 · МОНИТОР В3.1',
    'ТЕСТ ОЗУ ............. 64К ОК',
    'ЛЕНТОПРОТЯЖКА ........... ОК',
    'СВЯЗЬ С ПУЛЬТОМ ......... ОК',
    'ЧЕКПОИНТ ЗАПИСАН',
  ],
  menuFlamer: room => `ОТКЛ. ОГНЕМЁТ ${room}`,
  menuTapes: 'ВВЕСТИ ЛЕНТЫ',
  menuExit: 'ВЫХОД',
  flamerOff: room => `ОГНЕМЁТ ${room} ОТКЛЮЧЁН`,
  menuCamera: room => `ОТКЛ. КАМЕРЫ ${room}`,
  cameraOff: room => `КАМЕРЫ ${room} ОТКЛЮЧЕНЫ`,
  screenHint: 'СТРЕЛКИ — ВЫБОР · ПРЫЖОК/E — ДА',
  won: 'МИССИЯ ВЫПОЛНЕНА',
  resultRows: (time, tapes, hits) => [`ВРЕМЯ   ${time}`, `ЛЕНТЫ   ${tapes}`, `УДАРОВ  ${hits}`],
  marks: { noDamage: 'БЕЗ УРОНА', noFight: 'БЕЗ БОЯ', source: 'ИСТОЧНИК' },
  marksShort: { noDamage: 'БУ', noFight: 'ББ', source: 'И' },
  best: 'ЛУЧШИЕ',
  newRecord: 'НОВЫЙ РЕКОРД',
  copyHint: 'E/Y — СКОПИРОВАТЬ · ПРЫЖОК — ДАЛЬШЕ',
  copiedHint: 'СКОПИРОВАНО · ПРЫЖОК — ДАЛЬШЕ',
  failed: 'МИССИЯ ПРОВАЛЕНА',
  failedHint: 'ПРЫЖОК — ЗАНОВО',
  mapTitle: 'ПАУЗА · КАРТА',
  mapLegend: 'Т ТЕРМИНАЛ  Э ЭВМ  Щ ЩИТОК  Г ГАРАЖ  ▓ ЛЕНТА',
  mapHint: 'ESC/START — ПРОДОЛЖИТЬ · M — ЗВУК',
  mapIcons: { terminal: 'Т', main: 'Э', switch: 'Щ', bike: 'Г' },
  titleName: 'ДИВЕРСАНТКА',
  titleTask: `${MISSION.tapes} ЛЕНТ · ЭВМ · ЗАБОР · МОТОЦИКЛ. ${MISSION.time / 60} МИНУТ`,
  titleTask2: `БОМБА · РЕАКТОР · МОТОЦИКЛ. ${MISSIONS[2].time / 60} МИНУТ`,
  titleMission: 'МИССИЯ',
  titleKeys: [
    ['', 'КЛАВИАТУРА', 'ГЕЙМПАД'],
    ['ХОД', 'СТРЕЛКИ/WASD', 'СТИК/КРЕСТ'],
    ['ПРЫЖОК', 'ПРОБЕЛ', 'A'],
    ['УДАР', 'J', 'X'],
    ['БРОСОК', 'K', 'B'],
    ['ТЕРМИНАЛ/ЛИФТ', 'E', 'Y'],
    ['ПАУЗА', 'ESC', 'START'],
    ['ЗВУК', 'M', '—'],
  ],
  titleStart: 'ПРОБЕЛ — НАЧАТЬ',
  titleFocus: 'КЛИК ПО ЭКРАНУ, ЕСЛИ КЛАВИШИ НЕ РАБОТАЮТ',
  noWebgl: 'Браузер не поддерживает WebGL2. Откройте игру в свежем Chrome или Safari.',
};

// English: коротко, заглавными, в тоне терминала 80-х; ЭВМ — COMPUTER, ленты — TAPES.
const EN: Strings = {
  energy: 'ENERGY ',
  hudTapes: (n, total) => `TAPES ${n}/${total} · `,
  hudBomb: held => (held ? 'BOMB HELD · ' : 'BOMB — · '),
  dead: 'KILLED · JUMP — RETRY',
  credit: 'motion: mocap.cs.cmu.edu',
  liftHint: 'E — CALL LIFT',
  replayHud: 'REPLAY · SPACE — PLAY',
  missionName: { 1: 'MISSION 1 · BASE', 2: 'MISSION 2 · BUNKER' },
  prologue: { title: '', fly: 'JUMP — LET GO', fall: '', splash: 'SPLASHDOWN · RETRY', crash: 'HIT THE MAST · RETRY' },
  tapeFloat: (n, total) => `TAPE ${n}/${total}`,
  sourceFound: 'SOURCE FOUND',
  fenceLive: 'FENCE IS LIVE',
  killed: 'DOWN',
  blocked: 'block',
  needKey: n => `NEED KEY ${n}`,
  needBomb: 'NEED EXPLOSIVES',
  plantFirst: 'PLANT THE EXPLOSIVES',
  hudFuse: time => `BLAST ${time}`,
  notEnoughTapes: (n, total) => `NOT ENOUGH TAPES ${n}/${total}`,
  tapesIn: 'TAPES LOADED',
  accessDenied: 'ACCESS DENIED',
  fenceOff: 'FENCE OFF',
  resultLine: (time, tapes, hits, marks) =>
    ['Diversantka', time, `tapes ${tapes}`, `hits ${hits}`, ...marks.map(m => LINE_MARKS_EN[m])].join(' · '),
  bootLog: [
    'NII-7 · SERIES 2 COMPUTER · MONITOR V3.1',
    'RAM TEST ............. 64K OK',
    'TAPE DRIVE .............. OK',
    'CONSOLE LINK ............ OK',
    'CHECKPOINT SAVED',
  ],
  menuFlamer: room => `DISABLE FLAMER ${room}`,
  menuTapes: 'LOAD TAPES',
  menuExit: 'EXIT',
  flamerOff: room => `FLAMER ${room} DISABLED`,
  menuCamera: room => `DISABLE CAMERAS ${room}`,
  cameraOff: room => `CAMERAS ${room} DISABLED`,
  screenHint: 'ARROWS — SELECT · JUMP/E — OK',
  won: 'MISSION COMPLETE',
  resultRows: (time, tapes, hits) => [`TIME    ${time}`, `TAPES   ${tapes}`, `HITS    ${hits}`],
  marks: { noDamage: 'NO DAMAGE', noFight: 'NO FIGHT', source: 'SOURCE' },
  marksShort: { noDamage: 'ND', noFight: 'NF', source: 'S' },
  best: 'BEST',
  newRecord: 'NEW RECORD',
  copyHint: 'E/Y — COPY · JUMP — NEXT',
  copiedHint: 'COPIED · JUMP — NEXT',
  failed: 'MISSION FAILED',
  failedHint: 'JUMP — RESTART',
  mapTitle: 'PAUSED · MAP',
  mapLegend: 'T TERMINAL  C COMPUTER  S SWITCH  G GARAGE  ▓ TAPE',
  mapHint: 'ESC/START — RESUME · M — SOUND',
  mapIcons: { terminal: 'T', main: 'C', switch: 'S', bike: 'G' },
  titleName: 'DIVERSANTKA',
  titleTask: `${MISSION.tapes} TAPES · COMPUTER · FENCE · BIKE. ${MISSION.time / 60} MIN`,
  titleTask2: `BOMB · REACTOR · BIKE. ${MISSIONS[2].time / 60} MIN`,
  titleMission: 'MISSION',
  titleKeys: [
    ['', 'KEYBOARD', 'GAMEPAD'],
    ['MOVE', 'ARROWS/WASD', 'STICK/D-PAD'],
    ['JUMP', 'SPACE', 'A'],
    ['ATTACK', 'J', 'X'],
    ['THROW', 'K', 'B'],
    ['TERMINAL/LIFT', 'E', 'Y'],
    ['PAUSE', 'ESC', 'START'],
    ['SOUND', 'M', '—'],
  ],
  titleStart: 'SPACE — START',
  titleFocus: 'CLICK THE SCREEN IF KEYS DO NOT WORK',
  noWebgl: 'Your browser does not support WebGL2. Open the game in a recent Chrome or Safari.',
};

export const STR: Record<Lang, Strings> = { en: EN, ru: RU };

// Текущий язык — один на всю игру. По умолчанию русский: тесты, которые язык не трогают, видят прежние тексты.
// main.ts ставит язык при запуске (save.ts: loadLang), стартовый экран меняет его стрелками.
let current: Lang = 'ru';
export const lang = (): Lang => current;
export function setLang(l: Lang): void {
  current = l;
}
export const str = (): Strings => STR[current];
