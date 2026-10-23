// Operaciones de imagen sobre arrays tipados (sin dependencias).
import { homographyFromQuad, rollQuad } from './geometry.js';

export function toGray(data, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  return g;
}

function kernel1d(sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return { k, r };
}

// Desenfoque gaussiano separable con bordes reflejados
export function gaussianBlur(src, w, h, sigma) {
  if (sigma < 0.3) return Float32Array.from(src);
  const { k, r } = kernel1d(sigma);
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const refl = (i, n) => (i < 0 ? -i - 1 : i >= n ? 2 * n - i - 1 : i);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      if (x >= r && x < w - r) { for (let t = -r; t <= r; t++) s += k[t + r] * src[row + x + t]; }
      else { for (let t = -r; t <= r; t++) s += k[t + r] * src[row + refl(x + t, w)]; }
      tmp[row + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      if (y >= r && y < h - r) { for (let t = -r; t <= r; t++) s += k[t + r] * tmp[(y + t) * w + x]; }
      else { for (let t = -r; t <= r; t++) s += k[t + r] * tmp[refl(y + t, h) * w + x]; }
      out[y * w + x] = s;
    }
  }
  return out;
}

// Reducción por promedio de bloques f×f
export function downscaleBox(src, w, h, f) {
  const W = Math.floor(w / f), H = Math.floor(h / f);
  const out = new Float32Array(W * H);
  const inv = 1 / (f * f);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let dy = 0; dy < f; dy++) { const row = (y * f + dy) * w + x * f; for (let dx = 0; dx < f; dx++) s += src[row + dx]; }
    out[y * W + x] = s * inv;
  }
  return { data: out, w: W, h: H };
}

export function sobel(g, w, h) {
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = g[i - w - 1], b = g[i - w], c = g[i - w + 1], d = g[i - 1], f = g[i + 1], gg = g[i + w - 1], hh = g[i + w], ii = g[i + w + 1];
      gx[i] = (c + 2 * f + ii) - (a + 2 * d + gg);
      gy[i] = (gg + 2 * hh + ii) - (a + 2 * b + c);
    }
  }
  return { gx, gy };
}

export function bilinear(arr, w, h, x, y) {
  if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
  if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return arr[i] * (1 - fx) * (1 - fy) + arr[i + 1] * fx * (1 - fy) + arr[i + w] * (1 - fx) * fy + arr[i + w + 1] * fx * fy;
}

// Rectifica el cuadrilátero (rotado k posiciones) a un cuadrado de `size` px más margen.
// src: {data (RGBA Uint8ClampedArray), w, h}. ss: supermuestreo por eje.
export function warpRGBA(src, quad, k, size, margin = 0, ss = 1) {
  const H = homographyFromQuad(rollQuad(quad, k));
  const N = size + 2 * margin;
  const out = new Uint8ClampedArray(N * N * 4);
  const { data, w, h } = src;
  const inv = 1 / size, step = 1 / ss, norm = 1 / (ss * ss);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        const v = (y - margin + (sy + 0.5) * step) * inv;
        for (let sx = 0; sx < ss; sx++) {
          const u = (x - margin + (sx + 0.5) * step) * inv;
          const W = H[6] * u + H[7] * v + H[8];
          let X = (H[0] * u + H[1] * v + H[2]) / W, Y = (H[3] * u + H[4] * v + H[5]) / W;
          if (X < 0) X = 0; else if (X > w - 1.001) X = w - 1.001;
          if (Y < 0) Y = 0; else if (Y > h - 1.001) Y = h - 1.001;
          const x0 = X | 0, y0 = Y | 0, fx = X - x0, fy = Y - y0;
          const i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4;
          const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
          r += data[i00] * w00 + data[i10] * w10 + data[i01] * w01 + data[i11] * w11;
          g += data[i00 + 1] * w00 + data[i10 + 1] * w10 + data[i01 + 1] * w01 + data[i11 + 1] * w11;
          b += data[i00 + 2] * w00 + data[i10 + 2] * w10 + data[i01 + 2] * w01 + data[i11 + 2] * w11;
        }
      }
      const o = (y * N + x) * 4;
      out[o] = r * norm; out[o + 1] = g * norm; out[o + 2] = b * norm; out[o + 3] = 255;
    }
  }
  return { data: out, w: N, h: N };
}

export function colorfulness(img) {
  const d = img.data;
  let s = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    s += Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b)); n++;
  }
  return s / n;
}
