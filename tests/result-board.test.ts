import { afterEach, describe, expect, it } from 'vitest';
import { DT, MISSION, SOUNDS } from '../src/config';
import { createGame, stepGame, type Game } from '../src/game';
import { setLang, STR } from '../src/i18n';
import { IDLE } from '../src/input/intent';
import { PAL } from '../src/render/palette';
import { drawResult, joinParts, recordRow } from '../src/render/screens';
import type { Board, RecordRow } from '../src/save';
import { createMission, missionResult } from '../src/sim/mission';
import { replayUrl, shareText } from '../src/sim/record';
import { FLOOR, roomOf } from './helpers';

afterEach(() => setLang('ru'));

const row = (seconds: number, p: Partial<RecordRow> = {}): RecordRow => ({ seconds, hits: 1, attacks: 1, secret: false, date: '2026-10-06', ...p });
const shot = (board: Board | null) => {
  const out: { s: string; c: readonly number[] }[] = [];
  const b = { push: () => {}, text: (_x: number, _y: number, s: string, c: readonly number[]) => { out.push({ s, c }); } };
  const m = createMission({ room: 'x', x: 0, bottom: 0 });
  drawResult(b as never, missionResult(m), false, board);
  return out;
};

describe('строки итога', () => {
  it('строка для буфера обмена — по спеке', () => {
    expect(STR.ru.resultLine('12:54', '6/6', 3, ['noFight', 'source'])).toBe('Диверсантка · 12:54 · ленты 6/6 · ударов 3 · без боя · источник найден');
    expect(STR.en.resultLine('12:54', '6/6', 0, ['noDamage', 'noFight', 'source'])).toBe('Diversantka · 12:54 · tapes 6/6 · hits 0 · no damage · no fight · source found');
    expect(STR.ru.resultLine('12:54', '6/6', 3, [])).toBe('Диверсантка · 12:54 · ленты 6/6 · ударов 3');
  });

  it('строка таблицы: место, время, день.месяц, отметки сокращённо', () => {
    expect(recordRow(1, row(774, { hits: 3, attacks: 0, secret: true }))).toBe('1  12:54  06.10  ·ББ·И');
    expect(recordRow(2, row(774))).toBe('2  12:54  06.10');
    setLang('en');
    expect(recordRow(1, row(774, { hits: 0, attacks: 0, secret: true }))).toBe('1  12:54  06.10  ·ND·NF·S');
  });
});

describe('joinParts', () => {
  it('части через « · », перенос между частями, когда не влезает', () => {
    expect(joinParts(['БЕЗ УРОНА', 'БЕЗ БОЯ', 'ИСТОЧНИК'], 20)).toEqual(['БЕЗ УРОНА · БЕЗ БОЯ', 'ИСТОЧНИК']);
  });
});

describe('экран итогов: колонка ЛУЧШИЕ', () => {
  it('без рекордов — одна строка «—»; НОВЫЙ РЕКОРД нет', () => {
    for (const board of [null, { records: [], place: null }]) {
      const t = shot(board).map(x => x.s);
      expect(t).toContain('ЛУЧШИЕ');
      expect(t).toContain('—');
      expect(t).not.toContain('НОВЫЙ РЕКОРД');
    }
  });

  it('место 1: НОВЫЙ РЕКОРД, своя строка — цветом предмета, не больше 5 строк', () => {
    const records = [row(100), row(200), row(300), row(400), row(500), row(600)];
    const out = shot({ records, place: 1 });
    expect(out.map(x => x.s)).toContain('НОВЫЙ РЕКОРД');
    const rows = out.filter(x => /^\d  /.test(x.s));
    expect(rows.map(x => x.s[0])).toEqual(['1', '2', '3', '4', '5']);
    expect(rows[0].c).toBe(PAL.item);
    expect(rows[1].c).toBe(PAL.hud);
  });

  it('место 3 — подсвечена третья, НОВЫЙ РЕКОРД нет; место 7 — подсвеченных нет', () => {
    const records = [row(100), row(200), row(300), row(400), row(500), row(600), row(700)];
    const third = shot({ records, place: 3 });
    expect(third.map(x => x.s)).not.toContain('НОВЫЙ РЕКОРД');
    expect(third.filter(x => x.c === PAL.item && /^\d  /.test(x.s)).map(x => x.s[0])).toEqual(['3']);
    expect(shot({ records, place: 7 }).filter(x => x.c === PAL.item && /^\d  /.test(x.s))).toEqual([]);
  });
});

describe('звук record', () => {
  const R = { ...roomOf({ 22: FLOOR }), id: 'g', meta: { bike: '25,22' } };
  const won = (place: number | null): Game => {
    const g = createGame(new Map([['g', R]]), { room: 'g', x: 10, bottom: 22 });
    g.mission.result = 'won';
    g.board = place === null ? null : { records: [], place };
    return g;
  };
  const sfxUntilResult = (g: Game) => {
    const all: string[] = [];
    for (let i = 0; i < Math.round((MISSION.outroTime + 1) / DT); i++) {
      stepGame(g, IDLE, DT);
      all.push(...g.sfx);
      g.sfx.length = 0;
    }
    return all;
  };

  it('место 1 — ровно один раз, когда итог появляется', () => {
    const g = won(1);
    for (let i = 0; i < Math.round(MISSION.outroTime / DT) - 2; i++) stepGame(g, IDLE, DT);
    expect(g.sfx).not.toContain('record');
    expect(sfxUntilResult(g).filter(s => s === 'record')).toHaveLength(1);
    expect(SOUNDS.record.length).toBeGreaterThan(1);
  });

  it('место 2 и без таблицы — тишина', () => {
    expect(sfxUntilResult(won(2))).not.toContain('record');
    expect(sfxUntilResult(won(null))).not.toContain('record');
  });
});

describe('шаринг', () => {
  it('строка и ссылка — через перевод строки; без ссылки — только строка', () => {
    expect(shareText('Диверсантка · 12:54', 'https://x/?r=AB')).toBe('Диверсантка · 12:54\nhttps://x/?r=AB');
    expect(shareText('Диверсантка · 12:54', null)).toBe('Диверсантка · 12:54');
  });

  it('ссылка — текущая страница без query и hash, плюс ?r=', () => {
    expect(replayUrl('https://art-ps.github.io/diversantka/', 'AbC_-1')).toBe('https://art-ps.github.io/diversantka/?r=AbC_-1');
    expect(replayUrl('https://art-ps.github.io/diversantka/?r=old&x=1#top', 'New')).toBe('https://art-ps.github.io/diversantka/?r=New');
    expect(replayUrl('http://localhost:5173/index.html?debug', 'Q')).toBe('http://localhost:5173/index.html?r=Q');
  });
});
