import { describe, expect, it } from 'vitest';
import { DT, MISSION } from '../src/config';
import { IDLE, IntentTracker, clearPressed, fromGamepad, fromKeyboard, type Buttons, type Intent, type PadSnapshot } from '../src/input/intent';
import { CHARSET } from '../src/render/atlas';
import { createMission } from '../src/sim/mission';
import { STR } from '../src/i18n';
import { bootLines, menuItems, openScreen, stepScreen, type Screen } from '../src/sim/terminal';
import { parseTerminals, type TerminalSpawn } from '../src/world/spawns';

const BOOT_LOG = STR.ru.bootLog;

const pad = (axes: number[], pressed: number[] = []): PadSnapshot => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
});
const lab: TerminalSpawn = { x: 26, bottom: 22, controls: ['lab-2'], main: false };
const evm: TerminalSpawn = { x: 20, bottom: 14, controls: [], main: true };
const START = { room: 'lab-1', x: 4, bottom: 22 };
const I = (p: Partial<Intent>): Intent => ({ ...IDLE, ...p });
const booted = (term: TerminalSpawn): Screen => ({ ...openScreen(term), t: MISSION.bootTime });

describe('terminals:', () => {
  it('позиция, controls и main', () => {
    expect(parseTerminals('26,22 controls=lab-2,cave-1 ; 20,14 main', 'a')).toEqual([
      { x: 26, bottom: 22, controls: ['lab-2', 'cave-1'], main: false },
      { x: 20, bottom: 14, controls: [], main: true },
    ]);
    expect(parseTerminals(undefined, 'a')).toEqual([]);
  });

  it('ошибки с именем файла', () => {
    expect(() => parseTerminals('26 main', 'r')).toThrow('r: плохая запись терминала «26»');
    expect(() => parseTerminals('26,22 lift=x', 'r')).toThrow('r: у терминала непонятное «lift=x»');
    expect(() => parseTerminals('26,22 controls=', 'r')).toThrow('r: у терминала непонятное «controls=»');
  });
});

describe('ввод меню: вверх/вниз', () => {
  it('клавиатура и геймпад (крестовина и стик) дают одинаковые нажатия', () => {
    const seq = (read: (step: number) => Buttons) => {
      const t = new IntentTracker();
      return [0, 1, 2, 3].map(i => t.update(read(i)));
    };
    const kb = seq(i => fromKeyboard(new Set(i === 1 ? ['ArrowDown'] : i === 3 ? ['KeyW'] : [])));
    const dpad = seq(i => fromGamepad(pad([0, 0], i === 1 ? [13] : i === 3 ? [12] : [])));
    const stick = seq(i => fromGamepad(pad([0, i === 1 ? 0.9 : i === 3 ? -0.9 : 0])));
    expect(dpad).toEqual(kb);
    expect(stick).toEqual(kb);
    expect(kb.map(x => [x.upPressed, x.downPressed])).toEqual([[false, false], [false, true], [false, false], [true, false]]);
  });

  it('удержание — одно нажатие; clearPressed снимает', () => {
    const t = new IntentTracker();
    const held = fromKeyboard(new Set(['ArrowDown']));
    expect(t.update(held).downPressed).toBe(true);
    expect(t.update(held).downPressed).toBe(false);
    expect(clearPressed(I({ upPressed: true, downPressed: true, up: true }))).toEqual(I({ up: true }));
  });
});

describe('экран ЭВМ', () => {
  it('лог печатается за bootTime и кончается строкой «ЧЕКПОИНТ ЗАПИСАН»', () => {
    expect(bootLines(0)).toEqual([]);
    const half = bootLines(MISSION.bootTime / 2);
    expect(half.length).toBeGreaterThan(0);
    expect(half.length).toBeLessThan(BOOT_LOG.length + 1);
    expect(half.join('').length).toBeLessThan(BOOT_LOG.join('').length);
    expect(bootLines(MISSION.bootTime)).toEqual(BOOT_LOG);
    expect(BOOT_LOG.at(-1)).toBe('ЧЕКПОИНТ ЗАПИСАН');
  });

  it('пункты: огнемёты привязанных комнат, у главной ЭВМ — ввод лент, всегда выход', () => {
    expect(menuItems(lab).map(i => i.label)).toEqual(['ОТКЛ. ОГНЕМЁТ lab-2', 'ВЫХОД']);
    expect(menuItems(evm).map(i => i.label)).toEqual(['ВВЕСТИ ЛЕНТЫ', 'ВЫХОД']);
  });

  it('пока печатается лог, ввод не слушается', () => {
    const m = createMission(START);
    const s = openScreen(lab);
    expect(stepScreen(s, m, I({ downPressed: true }), DT)).toBe('stay');
    expect(stepScreen(s, m, I({ jumpPressed: true }), DT)).toBe('stay');
    expect(s.sel).toBe(0);
    expect(m.flamersOff.size).toBe(0);
  });

  it('стрелки ходят по кругу, прыжок или E выбирает', () => {
    const m = createMission(START);
    const s = booted(lab);
    stepScreen(s, m, I({ downPressed: true }), DT);
    expect(s.sel).toBe(1);
    stepScreen(s, m, I({ downPressed: true }), DT);
    expect(s.sel).toBe(0);
    stepScreen(s, m, I({ upPressed: true }), DT);
    expect(s.sel).toBe(1);
    expect(stepScreen(s, m, I({ usePressed: true }), DT)).toBe('close');
  });

  it('ОТКЛ. ОГНЕМЁТ выключает огнемёты комнаты', () => {
    const m = createMission(START);
    const s = booted(lab);
    expect(stepScreen(s, m, I({ jumpPressed: true }), DT)).toBe('changed');
    expect(m.flamersOff.has('lab-2')).toBe(true);
    expect(s.msg).toBe('ОГНЕМЁТ lab-2 ОТКЛЮЧЁН');
  });

  it('ВВЕСТИ ЛЕНТЫ: меньше шести — отказ, шесть — введены', () => {
    const m = createMission(START);
    const s = booted(evm);
    for (let i = 0; i < 5; i++) m.tapes.add(`r#t${i}`);
    stepScreen(s, m, I({ jumpPressed: true }), DT);
    expect(s.msg).toBe('НЕДОСТАТОЧНО ЛЕНТ 5/6');
    expect(m.tapesIn).toBe(false);
    m.tapes.add('r#t5');
    stepScreen(s, m, I({ usePressed: true }), DT);
    expect(s.msg).toBe('ЛЕНТЫ ВВЕДЕНЫ');
    expect(m.tapesIn).toBe(true);
  });

  it('клавиатура и геймпад проходят меню одинаково', () => {
    const run = (frames: Buttons[]) => {
      const t = new IntentTracker();
      const m = createMission(START);
      const s = booted({ ...lab, controls: ['a', 'b'] });
      const out = frames.map(f => stepScreen(s, m, t.update(f), DT));
      return { out, sel: s.sel, off: [...m.flamersOff] };
    };
    const kb = run([[], ['ArrowDown'], [], ['Space']].map(k => fromKeyboard(new Set(k))));
    const gp = run([[], [13], [], [0]].map(p => fromGamepad(pad([0, 0], p))));
    expect(gp).toEqual(kb);
    expect(kb.off).toEqual(['b']);
  });

  it('все тексты экрана — из атласа', () => {
    const texts = [...BOOT_LOG, ...menuItems({ ...lab, main: true }).map(i => i.label), 'ОГНЕМЁТ lab-2 ОТКЛЮЧЁН', 'НЕДОСТАТОЧНО ЛЕНТ 5/6', 'ЛЕНТЫ ВВЕДЕНЫ'];
    for (const ch of texts.join('')) expect(CHARSET).toContain(ch);
  });
});
