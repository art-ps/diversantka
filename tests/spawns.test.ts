import { describe, expect, it } from 'vitest';
import { parseEnemies, parseItems } from '../src/world/spawns';
import { loadRoomsFs } from './helpers';

describe('items:', () => {
  it('пусто — нет предметов', () => {
    expect(parseItems(undefined, 'a')).toEqual([]);
    expect(parseItems('', 'a')).toEqual([]);
  });

  it('несколько предметов через «;»', () => {
    expect(parseItems('knife@6,22 ; stone@25.5,14', 'a')).toEqual([
      { kind: 'knife', x: 6, bottom: 22 },
      { kind: 'stone', x: 25.5, bottom: 14 },
    ]);
  });

  it('неизвестный предмет и кривые координаты — ошибка с именем файла', () => {
    expect(() => parseItems('gun@1,2', 'lab-1')).toThrow('lab-1: неизвестный предмет «gun»');
    expect(() => parseItems('knife@x,2', 'lab-1')).toThrow('lab-1: плохая запись предмета «knife@x,2»');
  });
});

describe('enemies:', () => {
  it('андроид с участком патруля', () => {
    expect(parseEnemies('android@20,22 patrol=12..28', 'a')).toEqual([
      { kind: 'android', x: 20, bottom: 22, patrol: [12, 28] },
    ]);
  });

  it('ошибки: неизвестный враг, нет patrol, старт вне участка', () => {
    expect(() => parseEnemies('ninja@1,2 patrol=0..5', 'r')).toThrow('r: неизвестный враг «ninja»');
    expect(() => parseEnemies('android@1,2', 'r')).toThrow('r: у андроида нет patrol=a..b');
    expect(() => parseEnemies('android@30,22 patrol=12..28', 'r')).toThrow('r: андроид стоит вне своего участка 12..28');
  });

  it('шапки тестовых комнат читаются', () => {
    for (const room of loadRoomsFs().values()) {
      expect(() => parseItems(room.meta.items, room.id)).not.toThrow();
      expect(() => parseEnemies(room.meta.enemies, room.id)).not.toThrow();
    }
  });
});
