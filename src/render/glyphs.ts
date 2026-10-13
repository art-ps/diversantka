import type { Atlas } from './atlas';
import { createProgram } from './gl';

export type Color = readonly [number, number, number, number];

const VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aPos;
layout(location=2) in float aGlyph;
layout(location=3) in vec4 aColor;
layout(location=4) in float aScale;
uniform vec2 uGrid;
uniform vec2 uAtlasGrid;
out vec2 vUV;
out vec4 vColor;
void main() {
  vec2 p = aPos + 0.5 + (aCorner - 0.5) * aScale;
  gl_Position = vec4(p.x / uGrid.x * 2.0 - 1.0, 1.0 - p.y / uGrid.y * 2.0, 0.0, 1.0);
  vec2 cell = vec2(mod(aGlyph, uAtlasGrid.x), floor(aGlyph / uAtlasGrid.x));
  vUV = (cell + aCorner) / uAtlasGrid;
  vColor = aColor;
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 vUV;
in vec4 vColor;
uniform sampler2D uAtlas;
out vec4 o;
void main() {
  float a = texture(uAtlas, vUV).a * vColor.a;
  o = vec4(vColor.rgb * a, a);
}`;

const FLOATS = 8; // x, y, glyph, r, g, b, a, scale

export class GlyphBatch {
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private inst: WebGLBuffer;
  private tex: WebGLTexture;
  private data: Float32Array;
  private count = 0;
  private uGrid: WebGLUniformLocation;

  constructor(private gl: WebGL2RenderingContext, private atlas: Atlas, private max = 30000) {
    this.prog = createProgram(gl, VS, FS);
    this.data = new Float32Array(max * FLOATS);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.inst = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS * 4;
    const attr = (loc: number, size: number, offset: number) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    attr(1, 2, 0);
    attr(2, 1, 2);
    attr(3, 4, 3);
    attr(4, 1, 7);
    gl.bindVertexArray(null);

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.useProgram(this.prog);
    this.uGrid = gl.getUniformLocation(this.prog, 'uGrid')!;
    gl.uniform2f(gl.getUniformLocation(this.prog, 'uAtlasGrid'), atlas.cols, atlas.rows);
    gl.uniform1i(gl.getUniformLocation(this.prog, 'uAtlas'), 0);
  }

  // x, y — левый верх клетки в клетках комнаты; scale 1 = ровно клетка.
  push(x: number, y: number, ch: string, c: Color, scale = 1): void {
    const g = this.atlas.index.get(ch);
    if (g === undefined || this.count >= this.max) return;
    const o = this.count++ * FLOATS;
    const d = this.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = g;
    d[o + 3] = c[0]; d[o + 4] = c[1]; d[o + 5] = c[2]; d[o + 6] = c[3];
    d[o + 7] = scale;
  }

  text(x: number, y: number, s: string, c: Color, step = 1): void {
    [...s].forEach((ch, i) => this.push(x + i * step, y, ch, c));
  }

  // keep — не сбрасывать символы: тот же батч рисуется ещё раз в другую цель.
  draw(gridW: number, gridH: number, keep = false): void {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform2f(this.uGrid, gridW, gridH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.count * FLOATS);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // символы складываются по яркости — основа свечения
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    if (!keep) this.count = 0;
  }
}
