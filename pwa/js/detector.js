// Localización precisa del tablero: retícula de esquinas en X (puntos silla) + refinamiento
// por alineación de líneas de la cuadrícula + verificación del patrón de damero.
import {
  homographyFromQuad, applyH, fitHomography, squareSize, orderQuad, convexHull, fitQuadToHull, extrapolateQuad,
} from './geometry.js';
import { gaussianBlur, downscaleBox, sobel, bilinear } from './imageops.js';

/* ------------------------- Campo de gradiente ------------------------- */
const gradCache = new Map();
export function clearGradCache() { gradCache.clear(); }

export function gradField(gray, w, h, sigma) {
  const key = Math.round(sigma * 4) / 4;
  if (gradCache.has(key)) return gradCache.get(key);
  const f = Math.max(1, Math.floor(key / 1.5));
  let src = gray, W = w, H = h;
  if (f > 1) { const d = downscaleBox(gray, w, h, f); src = d.data; W = d.w; H = d.h; }
  const g = gaussianBlur(src, W, H, key / f);
  const { gx, gy } = sobel(g, W, H);
  let s = 0;
  for (let i = 0; i < gx.length; i += 3) s += Math.hypot(gx[i], gy[i]);
  const field = { gx, gy, w: W, h: H, f, norm: s / Math.ceil(gx.length / 3) + 1e-6 };
  gradCache.set(key, field);
  return field;
}

const M_SAMPLES = 48;
function lineEnergy(G, H, offset) {
  // Media de |∇I · n| a lo largo de las líneas u=const y v=const del tablero
  const ks = [];
  if (offset === 0) for (let k = 0; k <= 8; k++) ks.push(k / 8);
  else for (let k = 0; k < 8; k++) ks.push((k + offset) / 8);
  const e = 1e-3, f = G.f;
  let sum = 0, n = 0;
  for (const c of ks) {
    for (let m = 0; m < M_SAMPLES; m++) {
      const t = (m + 0.5) / M_SAMPLES;
      for (let ax = 0; ax < 2; ax++) {
        const u = ax === 0 ? c : t, v = ax === 0 ? t : c;
        const [x, y] = applyH(H, u, v);
        const [x2, y2] = ax === 0 ? applyH(H, u + e, v) : applyH(H, u, v + e);
        let nx = x2 - x, ny = y2 - y;
        const nn = Math.hypot(nx, ny) + 1e-12; nx /= nn; ny /= nn;
        const sx = (x + 0.5) / f - 0.5, sy = (y + 0.5) / f - 0.5;
        const gxv = bilinear(G.gx, G.w, G.h, sx, sy), gyv = bilinear(G.gy, G.w, G.h, sx, sy);
        sum += Math.abs(gxv * nx + gyv * ny); n++;
      }
    }
  }
  return sum / n / G.norm;
}

export function quadObjective(G, q) {
  const H = homographyFromQuad(q);
  if (!H) return -1e9;
  return lineEnergy(G, H, 0) - lineEnergy(G, H, 0.5);
}

export function refineQuad(G, quad, start = 0.35, end = 0.03, iters = 60) {
  let q = quad.map((p) => p.slice());
  let best = quadObjective(G, q);
  const sq = squareSize(q);
  let step = start * sq;
  const tryQ = (qq) => { const s = quadObjective(G, qq); if (s > best + 1e-6) { best = s; q = qq; return true; } return false; };
  while (step > end * sq) {
    let improved = true, n = 0;
    while (improved && n < iters) {
      improved = false; n++;
      for (let i = 0; i < 4; i++) for (let d = 0; d < 2; d++) for (const sg of [1, -1]) {
        const qq = q.map((p) => p.slice()); qq[i][d] += sg * step;
        if (tryQ(qq)) improved = true;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (tryQ(q.map((p) => [p[0] + dx * step, p[1] + dy * step]))) improved = true;
      }
      const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
      for (const fct of [1 + step / (4 * sq) / 2, 1 - step / (4 * sq) / 2]) {
        if (tryQ(q.map((p) => [cx + (p[0] - cx) * fct, cy + (p[1] - cy) * fct]))) improved = true;
      }
    }
    step *= 0.5;
  }
  return { quad: q, score: best };
}

const REL = [[0.18, 0.18], [0.82, 0.18], [0.18, 0.82], [0.82, 0.82], [0.5, 0.12], [0.12, 0.5], [0.88, 0.5], [0.5, 0.88]];
function median(a) { const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

export function checkerScore(gray, w, h, q) {
  const H = homographyFromQuad(q);
  const vals = new Float64Array(64);
  const tmp = new Array(REL.length);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    for (let t = 0; t < REL.length; t++) {
      const [x, y] = applyH(H, (c + REL[t][0]) / 8, (r + REL[t][1]) / 8);
      tmp[t] = bilinear(gray, w, h, x, y);
    }
    vals[r * 8 + c] = median(tmp);
  }
  const A = [], B = [];
  for (let i = 0; i < 64; i++) (((i >> 3) + (i & 7)) % 2 === 0 ? A : B).push(vals[i]);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const vr = (a, m) => a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length;
  const ma = mean(A), mb = mean(B);
  const sep = Math.abs(ma - mb);
  const spread = Math.sqrt((vr(A, ma) + vr(B, mb)) / 2) + 4;
  const mid = (ma + mb) / 2;
  const [hi, lo] = ma > mb ? [A, B] : [B, A];
  const frac = (hi.filter((v) => v > mid).length + lo.filter((v) => v < mid).length) / 64;
  return { cs: sep / spread, frac };
}

function totalScore(G, gray, w, h, q) {
  const ls = quadObjective(G, q);
  const { cs, frac } = checkerScore(gray, w, h, q);
  return { total: ls + 0.15 * Math.min(cs, 6) + 2 * frac, ls, cs, frac };
}

/* ------------------------- Puntos silla (esquinas en X) ------------------------- */
export function saddlePoints(gray, w, h, sigma, maxPts = 400) {
  const f = Math.max(1, Math.floor(sigma / 1.5));
  let src = gray, W = w, H = h;
  if (f > 1) { const d = downscaleBox(gray, w, h, f); src = d.data; W = d.w; H = d.h; }
  const s = sigma / f;
  const g = gaussianBlur(src, W, H, s);
  const R = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const ixx = g[i + 1] - 2 * g[i] + g[i - 1];
    const iyy = g[i + W] - 2 * g[i] + g[i - W];
    const ixy = (g[i + W + 1] - g[i + W - 1] - g[i - W + 1] + g[i - W - 1]) / 4;
    const r = ixy * ixy - ixx * iyy - 0.5 * (ixx + iyy) * (ixx + iyy);
    R[i] = r > 0 ? r : 0;
  }
  const k = Math.max(3, (Math.floor(s * 2)) | 1), rad = k >> 1;
  // NMS con máximo separable
  const tmp = new Float32Array(W * H), mx = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = 0; const a = Math.max(0, x - rad), b = Math.min(W - 1, x + rad);
    for (let t = a; t <= b; t++) if (R[y * W + t] > m) m = R[y * W + t];
    tmp[y * W + x] = m;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = 0; const a = Math.max(0, y - rad), b = Math.min(H - 1, y + rad);
    for (let t = a; t <= b; t++) if (tmp[t * W + x] > m) m = tmp[t * W + x];
    mx[y * W + x] = m;
  }
  let peaks = [];
  let vmax = 0;
  for (let i = 0; i < R.length; i++) if (R[i] > 0 && R[i] === mx[i]) { peaks.push(i); if (R[i] > vmax) vmax = R[i]; }
  if (peaks.length >= 20) peaks = peaks.filter((i) => R[i] > vmax * 0.02);
  peaks.sort((a, b) => R[b] - R[a]);
  peaks = peaks.slice(0, maxPts);
  const pts = [];
  for (const i of peaks) {
    const x = i % W, y = (i / W) | 0;
    let ox = 0, oy = 0;
    if (x >= 1 && x < W - 1 && y >= 1 && y < H - 1) {
      const dx = (R[i + 1] - R[i - 1]) / 2, dy = (R[i + W] - R[i - W]) / 2;
      const dxx = R[i + 1] - 2 * R[i] + R[i - 1], dyy = R[i + W] - 2 * R[i] + R[i - W];
      if (dxx < 0) ox = Math.max(-0.5, Math.min(0.5, -dx / dxx));
      if (dyy < 0) oy = Math.max(-0.5, Math.min(0.5, -dy / dyy));
    }
    pts.push([(x + ox + 0.5) * f - 0.5, (y + oy + 0.5) * f - 0.5]);
  }
  return pts;
}

class SpatialHash {
  constructor(pts, cell) {
    this.pts = pts; this.cell = cell; this.map = new Map();
    pts.forEach((p, i) => {
      const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
      if (!this.map.has(key)) this.map.set(key, []);
      this.map.get(key).push(i);
    });
  }
  nearest(x, y, r) {
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    let best = -1, bd = r * r;
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      const arr = this.map.get(`${gx},${gy}`);
      if (!arr) continue;
      for (const i of arr) {
        const dx = this.pts[i][0] - x, dy = this.pts[i][1] - y, dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = i; }
      }
    }
    return best;
  }
}

function growLattice(pts, grid, p, a, b, tol = 0.28, rounds = 4, R = 9) {
  let H = [a[0], b[0], p[0], a[1], b[1], p[1], 0, 0, 1];
  let corr = null;
  for (let rd = 0; rd < rounds; rd++) {
    const rr = rd < rounds - 1 ? Math.min(R, 2 + 2 * rd) : R;
    const keys = [], used = new Set();
    for (let i = -rr; i <= rr; i++) for (let j = -rr; j <= rr; j++) {
      const [x, y] = applyH(H, i, j);
      const [x1, y1] = applyH(H, i + 1, j), [x2, y2] = applyH(H, i, j + 1);
      const s = Math.min(Math.hypot(x1 - x, y1 - y), Math.hypot(x2 - x, y2 - y));
      if (!(s >= 4)) continue;
      const k = grid.nearest(x, y, tol * s);
      if (k >= 0 && !used.has(k)) { used.add(k); keys.push([i, j, k]); }
    }
    if (keys.length < 5) return null;
    const Hn = fitHomography(keys.map((t) => [t[0], t[1]]), keys.map((t) => pts[t[2]]));
    if (!Hn) return null;
    H = Hn; corr = keys;
  }
  return { H, corr };
}

function bestWindow(corr) {
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (const [i, j] of corr) { i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
  const W = i1 - i0 + 1, Hh = j1 - j0 + 1;
  const P = new Int32Array((W + 1) * (Hh + 1));
  const occ = new Uint8Array(W * Hh);
  for (const [i, j] of corr) occ[(i - i0) * Hh + (j - j0)] = 1;
  for (let x = 0; x < W; x++) for (let y = 0; y < Hh; y++) {
    P[(x + 1) * (Hh + 1) + y + 1] = occ[x * Hh + y] + P[x * (Hh + 1) + y + 1] + P[(x + 1) * (Hh + 1) + y] - P[x * (Hh + 1) + y];
  }
  const cnt = (a, b) => { // ventana [a,a+7)×[b,b+7) en coords de retícula
    const xa = Math.max(0, a - i0), xb = Math.min(W, a + 7 - i0), ya = Math.max(0, b - j0), yb = Math.min(Hh, b + 7 - j0);
    if (xa >= xb || ya >= yb) return 0;
    return P[xb * (Hh + 1) + yb] - P[xa * (Hh + 1) + yb] - P[xb * (Hh + 1) + ya] + P[xa * (Hh + 1) + ya];
  };
  let best = [-1, 0, 0];
  for (let a = i0 - 6; a <= i1; a++) for (let b = j0 - 6; b <= j1; b++) {
    const c = cnt(a, b);
    if (c > best[0]) best = [c, a, b];
  }
  return best;
}

export function findLattice(gray, w, h, sigma) {
  const pts = saddlePoints(gray, w, h, sigma);
  if (pts.length < 12) return null;
  const K = Math.min(9, pts.length);
  const nbrs = pts.map((p) => {
    const d = pts.map((q, i) => [(q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2, i]);
    d.sort((a, b) => a[0] - b[0]);
    return d.slice(0, K);
  });
  const nn1 = nbrs.map((d) => Math.sqrt(d[1][0])).sort((a, b) => a - b);
  const med = nn1[nn1.length >> 1];
  const grid = new SpatialHash(pts, Math.max(4, med));
  let best = null;
  const lim = Math.min(pts.length, 120);
  for (let pi = 0; pi < lim; pi++) {
    const p = pts[pi];
    const nb = nbrs[pi].slice(1).map(([, i]) => [pts[i][0] - p[0], pts[i][1] - p[1]]);
    for (let x = 0; x < nb.length; x++) for (let y = x + 1; y < nb.length; y++) {
      const a = nb[x], b = nb[y];
      const la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
      if (la < 5 || lb < 5 || Math.max(la, lb) / Math.min(la, lb) > 1.7) continue;
      if (Math.abs(a[0] * b[0] + a[1] * b[1]) / (la * lb) > 0.6) continue;
      if (grid.nearest(p[0] + a[0] + b[0], p[1] + a[1] + b[1], 0.25 * Math.min(la, lb)) < 0) continue;
      if (grid.nearest(p[0] - a[0], p[1] - a[1], 0.3 * la) < 0 && grid.nearest(p[0] - b[0], p[1] - b[1], 0.3 * lb) < 0) continue;
      const r = growLattice(pts, grid, p, a, b);
      if (!r) continue;
      const [n, wa, wb] = bestWindow(r.corr);
      if (!best || n > best.n) best = { n, H: r.H, wa, wb };
    }
    if (best && best.n >= 45 && pi > 20) break;
  }
  return best;
}

export function latticeQuads(gray, w, h, sigmas) {
  const out = [];
  for (const s of sigmas) {
    const r = findLattice(gray, w, h, s);
    if (!r) continue;
    for (const da of [0, -1, 1]) for (const db of [0, -1, 1]) {
      const a0 = r.wa - 1 + da, b0 = r.wb - 1 + db;
      out.push({ name: `lat${s.toFixed(1)}`, quad: [applyH(r.H, a0, b0), applyH(r.H, a0 + 8, b0), applyH(r.H, a0 + 8, b0 + 8), applyH(r.H, a0, b0 + 8)], n: r.n });
    }
  }
  return out;
}

/* ------------------------- Máscara U-Net -> cuadrilátero ------------------------- */
export function quadFromMask(prob, W, H, thr = 0.5) {
  const N = 256, m = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) m[i] = prob[i] > thr ? 1 : 0;
  const lab = new Int32Array(N * N), q = new Int32Array(N * N);
  let cur = 0, bestL = 0, bestSz = 0;
  for (let i = 0; i < N * N; i++) {
    if (!m[i] || lab[i]) continue;
    cur++; let hd = 0, tl = 0; q[tl++] = i; lab[i] = cur;
    while (hd < tl) {
      const c = q[hd++], y = c >> 8, x = c & 255;
      if (y > 0 && m[c - N] && !lab[c - N]) { lab[c - N] = cur; q[tl++] = c - N; }
      if (y < N - 1 && m[c + N] && !lab[c + N]) { lab[c + N] = cur; q[tl++] = c + N; }
      if (x > 0 && m[c - 1] && !lab[c - 1]) { lab[c - 1] = cur; q[tl++] = c - 1; }
      if (x < N - 1 && m[c + 1] && !lab[c + 1]) { lab[c + 1] = cur; q[tl++] = c + 1; }
    }
    if (tl > bestSz) { bestSz = tl; bestL = cur; }
  }
  if (bestSz < 400) return null;
  const pts = [];
  for (let i = 0; i < N * N; i++) if (lab[i] === bestL) {
    const y = i >> 8, x = i & 255;
    // solo píxeles de borde
    if (x === 0 || y === 0 || x === N - 1 || y === N - 1 || lab[i - 1] !== bestL || lab[i + 1] !== bestL || lab[i - N] !== bestL || lab[i + N] !== bestL) {
      pts.push([x * W / N, y * H / N]);
    }
  }
  return fitQuadToHull(convexHull(pts));
}

/* ------------------------- Selección final ------------------------- */
// Atajo: si un candidato (YOLO/U-Net) ya encaja como un damero casi perfecto, no hace falta buscar la retícula
export const EXCELLENT = (r) => r && r.frac >= 0.98 && r.cs >= 3 && r.ls >= 2.0;

export function refineCandidate(gray, w, h, c, log) {
  const sq = squareSize(c.quad);
  if (!(sq > 3)) return null;
  const G = gradField(gray, w, h, Math.max(0.8, sq / 10));
  const r1 = refineQuad(G, c.quad);
  const G2 = gradField(gray, w, h, Math.max(0.6, squareSize(r1.quad) / 16));
  const r2 = refineQuad(G2, r1.quad, 0.1, 0.02);
  let best = null;
  for (const i0 of [-1, 0, 1]) for (const j0 of [-1, 0, 1]) {
    const qq = extrapolateQuad(r2.quad, i0, j0, i0 + 8, j0 + 8);
    const sc = totalScore(G2, gray, w, h, qq);
    if (log) log.push({ name: c.name, i0, j0, ...sc });
    if (!best || sc.total > best.total) best = { ...sc, quad: qq, name: c.name };
  }
  return best;
}

export function chooseBoardQuad(gray, w, h, candidates, log = null, prior = null) {
  let best = prior;
  const keep = (r) => { if (r && (!best || r.total > best.total)) best = r; };
  if (EXCELLENT(best)) return { ...best, shortcut: true };
  const given = candidates.map((c) => ({ name: c.name, quad: orderQuad(c.quad) }));
  for (const c of given) {
    keep(refineCandidate(gray, w, h, c, log));
    if (EXCELLENT(best)) return { ...best, shortcut: true };
  }
  const sz = Math.max(w, h);
  const lq = latticeQuads(gray, w, h, [sz / 600, sz / 300, sz / 160]);
  const pre = [];
  for (const c of lq) {
    const q = orderQuad(c.quad);
    const sq = squareSize(q);
    if (!(sq > 3)) continue;
    const G0 = gradField(gray, w, h, Math.max(0.8, sq / 10));
    pre.push({ ...totalScore(G0, gray, w, h, q), name: c.name, quad: q });
  }
  pre.sort((a, b) => b.total - a.total);
  const seen = [];
  for (const p of pre) {
    const sq = squareSize(p.quad);
    if (seen.some((s) => Math.max(...s.map((pt, i) => Math.hypot(pt[0] - p.quad[i][0], pt[1] - p.quad[i][1]))) < sq * 0.5)) continue;
    seen.push(p.quad);
    keep(refineCandidate(gray, w, h, { name: p.name, quad: p.quad }, log));
    if (seen.length >= 3) break;
  }
  return best;
}
