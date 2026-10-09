export const CHARSET = (() => {
  let s = '';
  for (let c = 32; c < 127; c++) s += String.fromCharCode(c);
  s += 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя';
  s += '░▒▓█·';
  return s;
})();

export interface Atlas {
  canvas: HTMLCanvasElement;
  cols: number;
  rows: number;
  cell: number;
  index: Map<string, number>;
}

// Клетка квадратная, как на Спектруме: символ по центру квадрата.
export async function createAtlas(fontFamily: string, cell = 48): Promise<Atlas> {
  const font = `${Math.round(cell * 0.78)}px "${fontFamily}", monospace`;
  await document.fonts.load(font);
  const cols = 32;
  const rows = Math.ceil(CHARSET.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const index = new Map<string, number>();
  [...CHARSET].forEach((ch, i) => {
    index.set(ch, i);
    ctx.fillText(ch, (i % cols + 0.5) * cell, (Math.floor(i / cols) + 0.5) * cell);
  });
  return { canvas, cols, rows, cell, index };
}
