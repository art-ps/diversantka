import { describe, expect, it } from 'vitest';
import { parseRoom, validateWorld, type Room } from '../src/world/room';
import { roomOf } from './helpers';

const grid = (rows = 25, width = 40, ch = '.') => Array.from({ length: rows }, () => ch.repeat(width));
const text = (head: string[], g: string[]) => [...head, '---', ...g].join('\n') + '\n';

describe('parseRoom', () => {
  it('читает шапку, выходы и сетку', () => {
    const r = parseRoom(text(['id: lab-1', 'exits: left=- right=lab-2 up=- down=-', 'start: 4,22'], grid()));
    expect(r.id).toBe('lab-1');
    expect(r.exits).toEqual({ right: 'lab-2' });
    expect(r.meta).toEqual({ start: '4,22' });
    expect(r.tiles).toHaveLength(25);
  });

  it('понимает CRLF и пустые строки в конце', () => {
    const t = text(['id: a', 'exits: right=b'], grid()).replace(/\n/g, '\r\n') + '\r\n\r\n';
    expect(parseRoom(t).tiles[24]).toBe('.'.repeat(40));
  });

  it('строка не той длины — ошибка с номером строки файла', () => {
    const g = grid(); g[2] = '.'.repeat(39);
    expect(() => parseRoom(text(['id: a', 'exits: '], g), 'a.txt')).toThrow('a.txt:6: нужно 40 символов, а их 39');
  });

  it('неизвестный символ — ошибка', () => {
    const g = grid(); g[0] = '@' + '.'.repeat(39);
    expect(() => parseRoom(text(['id: a', 'exits: '], g), 'a.txt')).toThrow('a.txt:4: неизвестный символ «@»');
  });

  it('не 25 строк — ошибка', () => {
    expect(() => parseRoom(text(['id: a', 'exits: '], grid(24)), 'a.txt')).toThrow('нужно 25 строк сетки, а их 24');
  });

  it('нет id или разделителя — ошибка', () => {
    expect(() => parseRoom(text(['exits: '], grid()))).toThrow('нет id');
    expect(() => parseRoom('id: a\n' + grid().join('\n'))).toThrow('нет разделителя ---');
  });

  it('плохой выход — ошибка', () => {
    expect(() => parseRoom(text(['id: a', 'exits: north=b'], grid()))).toThrow('плохой выход: north=b');
  });
});

describe('validateWorld', () => {
  const r = (id: string, exits: Room['exits']): Room => ({ ...roomOf({}), id, exits });

  it('взаимные выходы — без ошибок', () => {
    expect(validateWorld(new Map([['a', r('a', { right: 'b' })], ['b', r('b', { left: 'a' })]]))).toEqual([]);
  });

  it('выход в несуществующую комнату', () => {
    expect(validateWorld(new Map([['a', r('a', { down: 'x' })]]))).toEqual(['a: выход down ведёт в несуществующую комнату x']);
  });

  it('невзаимный выход', () => {
    const errs = validateWorld(new Map([['a', r('a', { right: 'b' })], ['b', r('b', {})]]));
    expect(errs).toEqual(['a: выход right → b, но у b выход left не ведёт обратно']);
  });
});
