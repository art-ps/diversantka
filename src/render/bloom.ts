import type { Color } from './glyphs';
import { FX } from '../config';
import { createProgram } from './gl';

const FULL_VS = `#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const COPY_FS = `#version 300 es
precision mediump float;
in vec2 vUV; uniform sampler2D uTex; out vec4 o;
void main() { o = texture(uTex, vUV); }`;

const BLUR_FS = `#version 300 es
precision mediump float;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
void main() {
  float w[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec4 s = texture(uTex, vUV) * w[0];
  for (int i = 1; i < 5; i++) {
    s += texture(uTex, vUV + uDir * float(i)) * w[i];
    s += texture(uTex, vUV - uDir * float(i)) * w[i];
  }
  o = s;
}`;

const COMPOSITE_FS = `#version 300 es
precision mediump float;
in vec2 vUV; uniform sampler2D uScene; uniform sampler2D uGlow; uniform sampler2D uFig;
uniform float uStrength; uniform float uFigStrength; out vec4 o;
void main() {
  o = vec4(texture(uScene, vUV).rgb + texture(uGlow, vUV).rgb * uStrength + texture(uFig, vUV).rgb * uFigStrength, 1.0);
}`;

interface Target { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }

export class Bloom {
  private copy: WebGLProgram;
  private blur: WebGLProgram;
  private comp: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private scene!: Target;
  private a!: Target;
  private b!: Target;
  private fa!: Target;
  private fb!: Target;

  constructor(private gl: WebGL2RenderingContext) {
    this.copy = createProgram(gl, FULL_VS, COPY_FS);
    this.blur = createProgram(gl, FULL_VS, BLUR_FS);
    this.comp = createProgram(gl, FULL_VS, COMPOSITE_FS);
    this.vao = gl.createVertexArray()!;
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex, w, h };
  }

  resize(w: number, h: number): void {
    for (const t of [this.scene, this.a, this.b, this.fa, this.fb]) {
      if (!t) continue;
      this.gl.deleteFramebuffer(t.fb);
      this.gl.deleteTexture(t.tex);
    }
    const q = (n: number) => Math.max(1, Math.floor(n / 4));
    this.scene = this.target(w, h);
    this.a = this.target(q(w), q(h));
    this.b = this.target(q(w), q(h));
    this.fa = this.target(q(w), q(h));
    this.fb = this.target(q(w), q(h));
  }

  begin(bg: Color): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb);
    gl.viewport(0, 0, this.scene.w, this.scene.h);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private pass(prog: WebGLProgram, src: WebGLTexture, dst: Target | null, setup?: () => void): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
    gl.viewport(0, 0, dst ? dst.w : gl.drawingBufferWidth, dst ? dst.h : gl.drawingBufferHeight);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
    setup?.();
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Слой фигур: draw рисует фигуры в текстуру четверть-размера; end размоет её отдельно.
  layer(draw: () => void): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fa.fb);
    gl.viewport(0, 0, this.fa.w, this.fa.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    draw();
  }

  private blurPingPong(a: Target, b: Target, passes: number): void {
    const gl = this.gl;
    const dir = this.blur;
    for (let i = 0; i < passes; i++) {
      this.pass(dir, a.tex, b, () => gl.uniform2f(gl.getUniformLocation(dir, 'uDir'), 1 / a.w, 0));
      this.pass(dir, b.tex, a, () => gl.uniform2f(gl.getUniformLocation(dir, 'uDir'), 0, 1 / a.h));
    }
  }

  // strength 0 — без общего свечения; figStrength 0 — без свечения фигур (слой тогда не размывается).
  end(strength: number, figStrength: number): void {
    const gl = this.gl;
    if (strength > 0) {
      this.pass(this.copy, this.scene.tex, this.a);
      this.blurPingPong(this.a, this.b, 2);
    }
    if (figStrength > 0) this.blurPingPong(this.fa, this.fb, FX.figGlowPasses);
    this.pass(this.comp, this.scene.tex, null, () => {
      gl.uniform1i(gl.getUniformLocation(this.comp, 'uScene'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.a.tex);
      gl.uniform1i(gl.getUniformLocation(this.comp, 'uGlow'), 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.fa.tex);
      gl.uniform1i(gl.getUniformLocation(this.comp, 'uFig'), 2);
      gl.uniform1f(gl.getUniformLocation(this.comp, 'uStrength'), strength);
      gl.uniform1f(gl.getUniformLocation(this.comp, 'uFigStrength'), figStrength);
    });
  }
}
