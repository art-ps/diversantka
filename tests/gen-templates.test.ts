import { describe, expect, it } from 'vitest';
import { checkTemplate, cameraText, enemyText, flamerText, mirror, mirrorable, OPENING, parseSlots, parseTemplate, seal } from '../src/gen/templates';

const WALL = '#'.repeat(40);
// Сетка 25 строк: заданные строки — как есть, остальные — стена.
const grid = (rows: Record<number, string>) => Array.from({ length: 25 }, (_, r) => rows[r] ?? WALL).join('\n');
const fill = (from: number, to: number, row: string) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, row]));

// Коридор left–right по стандарту проёмов: потолок 14, пол 22, шипы 23–24 на строке 21.
const HALL_ROWS = {
  ...fill(14, 17, '###' + '.'.repeat(34) + '###'),
  ...fill(18, 20, '.'.repeat(40)),
  21: '.'.repeat(23) + '^^' + '.'.repeat(15),
};
const HALL_HEAD = [
  'id: hall',
  'fits: left right',
  'min: 3',
  'ambient: hum',
  'slots: enemy@11,22 patrol=7..15 ; enemy@31,22 patrol=27..35 ; item@5,22 ; terminal@35,22 ; site@16,22 ; flamer@38,19 dir=left ; camera@20,15 arc=-60..30 period=4',
].join('\n');
const tpl = (head: string, rows: Record<number, string>) => `${head}\n---\n${grid(rows)}`;
const hall = () => parseTemplate(tpl(HALL_HEAD, HALL_ROWS), 'hall.txt');

describe('разбор', () => {
  it('fits, min, tags, слоты всех видов', () => {
    const t = hall();
    expect(t.id).toBe('hall');
    expect([...t.fits].sort()).toEqual(['left', 'right']);
    expect(t.min).toBe(3);
    expect(t.tags.size).toBe(0);
    expect(t.slots).toEqual([
      { kind: 'enemy', x: 11, bottom: 22, patrol: [7, 15] },
      { kind: 'enemy', x: 31, bottom: 22, patrol: [27, 35] },
      { kind: 'item', x: 5, bottom: 22 },
      { kind: 'terminal', x: 35, bottom: 22 },
      { kind: 'site', x: 16, bottom: 22 },
      { kind: 'flamer', x: 38, y: 19, dir: -1 },
      { kind: 'camera', x: 20, y: 15, arc: [-60, 30], period: 4 },
    ]);
    expect(t.tiles).toHaveLength(25);
  });

  it('min по умолчанию — первый сгенерированный уровень; плохие fits, min и слоты — ошибка с именем файла', () => {
    expect(parseTemplate(tpl(HALL_HEAD.replace('min: 3\n', ''), HALL_ROWS)).min).toBe(3);
    expect(() => parseTemplate(tpl(HALL_HEAD.replace('fits: left right', 'fits: left side'), HALL_ROWS), 'x.txt')).toThrow(/x\.txt: .*side/);
    expect(() => parseTemplate(tpl(HALL_HEAD.replace('fits: left right', 'fits:'), HALL_ROWS), 'x.txt')).toThrow(/x\.txt/);
    expect(() => parseTemplate(tpl(HALL_HEAD.replace('min: 3', 'min: 2'), HALL_ROWS), 'x.txt')).toThrow(/x\.txt/);
    expect(() => parseSlots('box@1,2', 'x.txt')).toThrow(/x\.txt: .*box/);
    expect(() => parseSlots('enemy@5,22', 'x.txt')).toThrow(/x\.txt/); // нет patrol
  });

  it('текст слотов для шапки комнаты читается парсерами мира обратно', () => {
    const t = hall();
    const [e] = t.slots.filter(s => s.kind === 'enemy');
    const f = t.slots.find(s => s.kind === 'flamer')!;
    const c = t.slots.find(s => s.kind === 'camera')!;
    expect(e.kind === 'enemy' && enemyText('guard', e)).toBe('guard@11,22 patrol=7..15');
    expect(f.kind === 'flamer' && flamerText(f)).toBe('flamer@38,19 dir=left');
    expect(c.kind === 'camera' && cameraText(c)).toBe('20,15 arc=-60..30 period=4');
  });
});

describe('зеркало', () => {
  it('выходы меняются местами, строки — задом наперёд, слоты — от правого края', () => {
    const t = hall(), m = mirror(t);
    expect(m.id).toBe('hall~m');
    expect([...m.fits].sort()).toEqual(['left', 'right']);
    expect(m.tiles[21]).toBe([...t.tiles[21]].reverse().join(''));
    expect(m.slots).toEqual([
      { kind: 'enemy', x: 29, bottom: 22, patrol: [25, 33] },
      { kind: 'enemy', x: 9, bottom: 22, patrol: [5, 13] },
      { kind: 'item', x: 35, bottom: 22 },
      { kind: 'terminal', x: 5, bottom: 22 },
      { kind: 'site', x: 24, bottom: 22 },
      { kind: 'flamer', x: 2, y: 19, dir: 1 },
      { kind: 'camera', x: 19, y: 15, arc: [-30, 60], period: 4 },
    ]);
    const back = mirror(m);
    expect(back.tiles).toEqual(t.tiles);
    expect(back.slots).toEqual(t.slots);
  });

  it('left без right становится right без left', () => {
    const head = HALL_HEAD.replace('fits: left right', 'fits: left');
    const rows = { ...HALL_ROWS, ...fill(18, 21, '.'.repeat(37) + '###') };
    expect([...mirror(parseTemplate(tpl(head, rows))).fits]).toEqual(['right']);
  });
});

describe('заделка и проверка стандарта', () => {
  it('seal: клетки проёма — стена', () => {
    const tiles = hall().tiles.map(r => [...r]);
    seal(tiles, 'left');
    for (const [c, r] of OPENING.left) expect(tiles[r][c]).toBe('#');
    expect(tiles[18][3]).toBe('.');
  });

  it('коридор по стандарту и его зеркало — без ошибок', () => {
    expect(checkTemplate(hall())).toEqual([]);
    expect(checkTemplate(mirror(hall()))).toEqual([]);
  });

  it('проём без перемычки, открытый проём без выхода, дверь в шаблоне — ошибки', () => {
    const noLintel = parseTemplate(tpl(HALL_HEAD, { ...HALL_ROWS, 17: '.'.repeat(40) }));
    expect(checkTemplate(noLintel).join('\n')).toMatch(/left/);
    const openUp = parseTemplate(tpl(HALL_HEAD, { ...HALL_ROWS, 0: '#'.repeat(29) + '.H.' + '#'.repeat(8) }));
    expect(checkTemplate(openUp).join('\n')).toMatch(/up/);
    const door = parseTemplate(tpl(HALL_HEAD, { ...HALL_ROWS, 20: '.'.repeat(10) + '1' + '.'.repeat(29) }));
    expect(checkTemplate(door).join('\n')).toMatch(/двер/);
  });

  it('слот точки или врага в воздухе — ошибка; на платформе «=» — можно', () => {
    const air = parseTemplate(tpl(HALL_HEAD.replace('item@5,22', 'item@5,20'), HALL_ROWS));
    expect(checkTemplate(air).join('\n')).toMatch(/item 5,20/);
    const ledge = parseTemplate(tpl(HALL_HEAD.replace('item@5,22', 'item@6,16'), { ...HALL_ROWS, 16: '###' + '='.repeat(6) + '.'.repeat(28) + '###' }));
    expect(checkTemplate(ledge)).toEqual([]);
  });

  it('не-стартовому шаблону нужны слот предмета и слот врага', () => {
    const bare = parseTemplate(tpl(HALL_HEAD.replace(/slots: .*/, 'slots: site@16,22'), HALL_ROWS));
    const msg = checkTemplate(bare).join('\n');
    expect(msg).toMatch(/item/);
    expect(msg).toMatch(/enemy/);
  });

  it('камера в стене и враг под решёткой — ошибки валидаторов мира', () => {
    const wall = parseTemplate(tpl(HALL_HEAD.replace('camera@20,15', 'camera@20,5'), HALL_ROWS));
    expect(checkTemplate(wall).join('\n')).toMatch(/камера 20,5 в стене/);
    const gate = parseTemplate(tpl(HALL_HEAD, { ...HALL_ROWS, ...fill(18, 20, '.'.repeat(10) + 'A' + '.'.repeat(29)) }));
    expect(checkTemplate(gate).join('\n')).toMatch(/решёткой 10/);
  });

  it('стартовый: start, bike, fence и fits ровно right down; небо над ним можно', () => {
    const rows = {
      ...fill(0, 12, '.'.repeat(40)),
      13: '.'.repeat(30) + '#'.repeat(10),
      ...fill(14, 17, '.'.repeat(30) + '#' + '.'.repeat(6) + '###'),
      ...fill(18, 21, '###' + '.'.repeat(37)),
      ...fill(22, 24, '#'.repeat(29) + '.H.' + '#'.repeat(8)),
    };
    const head = ['id: yard', 'fits: right down', 'tags: start', 'ambient: wind', 'start: 9,22', 'bike: 5,22', 'fence: 7,18..21'].join('\n');
    expect(checkTemplate(parseTemplate(tpl(head, rows)))).toEqual([]);
    expect(checkTemplate(parseTemplate(tpl(head.replace('bike: 5,22\n', ''), rows))).join('\n')).toMatch(/bike/);
    expect(checkTemplate(parseTemplate(tpl(head.replace('fits: right down', 'fits: right'), rows))).join('\n')).toMatch(/right down/);
  });
});

describe('зеркалятся не все', () => {
  const shaft = fill(22, 24, '#'.repeat(29) + '.H.' + '#'.repeat(8));
  const down = () => parseTemplate(tpl(HALL_HEAD.replace('fits: left right', 'fits: left right down').replace('enemy@31,22 patrol=27..35', 'enemy@34,22 patrol=32..36'), { ...HALL_ROWS, ...shaft }));

  it('mirrorable: коридор — да, стартовый и с выходом down — нет', () => {
    expect(mirrorable(hall())).toBe(true);
    const yard = parseTemplate(tpl('id: yard\nfits: right down\ntags: start', {}));
    expect(mirrorable(yard)).toBe(false);
    expect(mirrorable(down())).toBe(false);
  });

  it('шаблон с down по стандарту, а его зеркало — нет (шахта уезжает в колонки 8–10)', () => {
    expect(checkTemplate(down())).toEqual([]);
    const msg = checkTemplate(mirror(down()));
    expect(msg.length).toBeGreaterThan(0);
    expect(msg.join('\n')).toMatch(/down/);
  });
});
