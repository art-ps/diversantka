import { CHARSET, createAtlas } from './render/atlas';
import { Bloom } from './render/bloom';
import { GlyphBatch, type Color } from './render/glyphs';
import { PAL } from './render/palette';

async function boot() {
  const canvas = document.getElementById('screen') as HTMLCanvasElement;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })!;
  const cell = Math.floor(Math.min(innerWidth / 40, innerHeight / 25));
  canvas.style.width = `${cell * 40}px`;
  canvas.style.height = `${cell * 25}px`;
  canvas.width = cell * 40 * devicePixelRatio;
  canvas.height = cell * 25 * devicePixelRatio;
  const batch = new GlyphBatch(gl, await createAtlas('JetBrains Mono'));
  const bloom = new Bloom(gl);
  bloom.resize(canvas.width, canvas.height);
  const colors: Color[] = [PAL.wall, PAL.platform, PAL.ladder, PAL.water, PAL.hazard, PAL.nina];
  let glow = true;
  addEventListener('keydown', e => { if (e.code === 'KeyB') glow = !glow; });
  const frame = (t: number) => {
    bloom.begin(PAL.bg);
    [...CHARSET].forEach((ch, i) => batch.push(i % 40, Math.floor(i / 40) * 2 + 2, ch, colors[i % colors.length]));
    batch.text(2, 22, 'ДИВЕРСАНТКА · проверка атласа', PAL.hud);
    batch.push(20 + Math.sin(t / 500) * 10, 18, '@', PAL.nina, 2);
    batch.draw(40, 25);
    bloom.end(glow ? 1.2 : 0);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
