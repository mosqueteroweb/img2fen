// Motor de reconocimiento Img2FEN Pro:
// 1) localización precisa del tablero (retícula de esquinas + U-Net + YOLO) con refinamiento subpíxel
// 2) rectificación en perspectiva y elección automática de la rotación (0/90/180/270°)
// 3) clasificación por casillas (CNN de casillas con test-time augmentation) fusionada con YOLO
// 4) decodificación con reglas (un rey por bando, sin peones en 1ª/8ª, máx. 8 peones)
// 5) orientación (vista desde blancas/negras) y turno
import * as ort from './vendor/ort.wasm.min.mjs';
import { toGray, warpRGBA, colorfulness, downscaleBox } from './imageops.js';
import { homographyFromQuad, invert3x3, applyH, squareSize, orderQuad, rollQuad, quadFromAABB } from './geometry.js';
import { chooseBoardQuad, refineQuad, gradField, clearGradCache, quadFromMask, checkerScore } from './detector.js';

const ROOT = new URL('../', import.meta.url).href;
ort.env.wasm.wasmPaths = `${ROOT}wasm/`;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

export const LABELS = '1KQRBNPkqrbnp'; // índice 0 = vacía
const YOLO_NAMES = { 1: 'p', 2: 'r', 3: 'b', 4: 'n', 5: 'k', 6: 'q', 7: 'P', 8: 'R', 9: 'B', 10: 'N', 11: 'K', 12: 'Q' };
const IDX = Object.fromEntries([...LABELS].map((c, i) => [c, i]));

const sessions = {};
function session(name) {
  if (!sessions[name]) {
    sessions[name] = ort.InferenceSession.create(`${ROOT}model/${name}.onnx`, {
      executionProviders: ['wasm'], graphOptimizationLevel: 'all',
    }).catch((e) => { delete sessions[name]; throw e; });
  }
  return sessions[name];
}
export function preloadModels() {
  return Promise.allSettled(['chess-tiles-v2', 'chess-yolo26n', 'board-segmentation'].map(session));
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/* ------------------------- utilidades de imagen ------------------------- */
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
export function imageToData(source, maxDim) {
  const sw = source.naturalWidth || source.videoWidth || source.width;
  const sh = source.naturalHeight || source.videoHeight || source.height;
  const s = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * s)), h = Math.max(1, Math.round(sh * s));
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h, scale: s };
}
function resizeRGBA(img, W, H) {
  const c = makeCanvas(img.w, img.h);
  c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  const d = makeCanvas(W, H);
  const ctx = d.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, W, H);
  return ctx.getImageData(0, 0, W, H).data;
}

/* ------------------------- modelos ------------------------- */
async function runYolo(img, conf = 0.1) {
  const sess = await session('chess-yolo26n');
  const s = Math.min(640 / img.w, 640 / img.h);
  const nw = Math.round(img.w * s), nh = Math.round(img.h * s);
  const px = Math.floor((640 - nw) / 2), py = Math.floor((640 - nh) / 2);
  const rs = (nw === img.w && nh === img.h) ? img.data : resizeRGBA(img, nw, nh);
  const C = 640 * 640, t = new Float32Array(3 * C).fill(114 / 255);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const i = (y * nw + x) * 4, o = (y + py) * 640 + x + px;
    t[o] = rs[i] / 255; t[C + o] = rs[i + 1] / 255; t[2 * C + o] = rs[i + 2] / 255;
  }
  const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, 640, 640]) });
  const r = out[sess.outputNames[0]].data;
  const dets = [];
  for (let i = 0; i < r.length / 6; i++) {
    const b = i * 6;
    if (r[b + 4] < conf) continue;
    const x1 = (r[b] - px) / s, y1 = (r[b + 1] - py) / s, x2 = (r[b + 2] - px) / s, y2 = (r[b + 3] - py) / s;
    dets.push({ x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, conf: r[b + 4], cls: Math.round(r[b + 5]) });
  }
  return dets;
}

async function runUnet(img) {
  const sess = await session('board-segmentation');
  const rs = resizeRGBA(img, 256, 256);
  const C = 256 * 256, t = new Float32Array(3 * C);
  for (let i = 0; i < C; i++) { t[i] = rs[i * 4] / 255; t[C + i] = rs[i * 4 + 1] / 255; t[2 * C + i] = rs[i * 4 + 2] / 255; }
  const out = await sess.run({ input: new ort.Tensor('float32', t, [1, 3, 256, 256]) });
  const o = out.output.data, p = new Float32Array(C);
  for (let i = 0; i < C; i++) p[i] = 1 / (1 + Math.exp(-o[i]));
  return p;
}

async function runTiles(tiles, n) {
  const sess = await session('chess-tiles-v2');
  const out = await sess.run({ tiles: new ort.Tensor('float32', tiles, [n, 1024]) });
  return out.probs.data;
}

/* ------------------------- clasificación de casillas ------------------------- */
function jitterQuad(q, dx, dy, sc) {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4, s = squareSize(q);
  return q.map((p) => [cx + (p[0] - cx) * sc + dx * s, cy + (p[1] - cy) * sc + dy * s]);
}
function boardToTiles(rgba512, out, offset) {
  // 512×512 RGBA -> 256×256 gris (promedio 2×2) -> 64 casillas de 32×32 en [0,1]
  const d = rgba512.data;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    let s = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = ((2 * y + dy) * 512 + 2 * x + dx) * 4;
      s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    const tile = (y >> 5) * 8 + (x >> 5);
    out[offset + tile * 1024 + (y & 31) * 32 + (x & 31)] = s / (4 * 255);
  }
}
const TTA = [[0, 0, 1], [0.04, 0, 1], [-0.04, 0, 1], [0, 0.04, 1], [0, -0.04, 1], [0, 0, 1.015], [0, 0, 0.985]];

async function tileProbs(src, quad, ks, tta) {
  const jit = tta ? TTA : [TTA[0]];
  const n = ks.length * jit.length;
  const tiles = new Float32Array(n * 64 * 1024);
  let b = 0;
  for (const k of ks) for (const [dx, dy, sc] of jit) {
    boardToTiles(warpRGBA(src, jitterQuad(quad, dx, dy, sc), k, 512, 0, 1), tiles, b * 64 * 1024); b++;
  }
  const probs = await runTiles(tiles, n * 64);
  const res = [];
  b = 0;
  for (let ki = 0; ki < ks.length; ki++) {
    const P = new Float32Array(64 * 13);
    for (let j = 0; j < jit.length; j++, b++) for (let i = 0; i < 64 * 13; i++) P[i] += probs[b * 64 * 13 + i] / jit.length;
    res.push(P);
  }
  return res;
}

const YSIZE = 544, YMARGIN = 48;
async function yoloOnBoard(src, quad, k) {
  const rect = warpRGBA(src, quad, k, YSIZE, YMARGIN, 2);
  const dets = await runYolo(rect, 0.05);
  const P = new Float32Array(64 * 13);
  const extra = { rank1: null, lmEnd: [], lmStart: [], rect };
  for (const d of dets) {
    const u = (d.cx - YMARGIN) / YSIZE, v = (d.cy - YMARGIN) / YSIZE;
    if (YOLO_NAMES[d.cls]) {
      if (u < -0.02 || u >= 1.02 || v < -0.02 || v >= 1.02) continue;
      const c = Math.min(7, Math.max(0, Math.floor(u * 8))), r = Math.min(7, Math.max(0, Math.floor(v * 8)));
      const j = (r * 8 + c) * 13 + IDX[YOLO_NAMES[d.cls]];
      if (d.conf > P[j]) P[j] = d.conf;
    } else if (d.cls === 13) {
      if (!extra.rank1 || d.conf > extra.rank1.conf) extra.rank1 = { conf: d.conf, u, v };
    } else if (d.cls === 15) extra.lmEnd.push({ conf: d.conf, u, v });
    else if (d.cls === 14) extra.lmStart.push({ conf: d.conf, u, v });
  }
  return { P, extra };
}

function yoloToProbs(Py) {
  const E = new Float32Array(64 * 13);
  for (let i = 0; i < 64; i++) {
    let s = 0, sum = 0;
    for (let c = 0; c < 13; c++) { const v = Py[i * 13 + c]; sum += v; if (v > s) s = v; }
    if (s < 0.25) { E[i * 13] = 1; continue; }
    for (let c = 0; c < 13; c++) E[i * 13 + c] = Py[i * 13 + c] / sum * s;
    E[i * 13] = 1 - s;
  }
  return E;
}

/* ------------------------- decodificación con reglas ------------------------- */
export function decodeWithRules(L) {
  L = Float64Array.from(L);
  const IK = IDX.K, Ik = IDX.k, IP = IDX.P, Ip = IDX.p;
  const argmax = () => { const a = []; for (let i = 0; i < 64; i++) { let m = 0; for (let c = 1; c < 13; c++) if (L[i * 13 + c] > L[i * 13 + m]) m = c; a.push(m); } return a; };
  for (const r of [0, 7]) for (let c = 0; c < 8; c++) { L[(r * 8 + c) * 13 + IP] = -1e9; L[(r * 8 + c) * 13 + Ip] = -1e9; }
  for (const KI of [IK, Ik]) {
    let best = -1, bp = -1;
    for (let i = 0; i < 64; i++) {
      let mx = -Infinity; for (let c = 0; c < 13; c++) mx = Math.max(mx, L[i * 13 + c]);
      let z = 0; for (let c = 0; c < 13; c++) z += Math.exp(L[i * 13 + c] - mx);
      const p = Math.exp(L[i * 13 + KI] - mx) / z;
      if (p > bp) { bp = p; best = i; }
    }
    if (bp > 0.02) {
      for (let i = 0; i < 64; i++) L[i * 13 + KI] = -1e9;
      for (let c = 0; c < 13; c++) L[best * 13 + c] = -1e9;
      L[best * 13 + KI] = 0;
    }
  }
  let a = argmax();
  for (const PI of [IP, Ip]) {
    const idx = [];
    for (let i = 0; i < 64; i++) if (a[i] === PI) idx.push(i);
    if (idx.length > 8) {
      const marg = idx.map((i) => { const row = Array.from(L.slice(i * 13, i * 13 + 13)).sort((x, y) => y - x); return [L[i * 13 + PI] - row[1], i]; });
      marg.sort((x, y) => x[0] - y[0]);
      for (const [, i] of marg.slice(0, idx.length - 8)) L[i * 13 + PI] = -1e9;
      a = argmax();
    }
  }
  return a.map((c) => (c === 0 ? null : LABELS[c]));
}

/* ------------------------- orientación y turno ------------------------- */
// Probabilidad aproximada de encontrar cada tipo de pieza blanca en las filas 1..8 en partidas reales
// (las negras se reflejan). Se usa como razón de verosimilitud "vista normal" vs "vista girada".
const RANK_PRIOR = {
  P: [0.001, 0.30, 0.25, 0.20, 0.13, 0.08, 0.04, 0.001],
  K: [0.45, 0.20, 0.12, 0.08, 0.06, 0.04, 0.03, 0.02],
  X: [0.25, 0.17, 0.17, 0.13, 0.11, 0.08, 0.05, 0.04],
};
export function orientationScore(grid) {
  // > 0 => blancas abajo (vista normal); < 0 => tablero visto desde negras
  let llr = 0;
  grid.forEach((p, i) => {
    if (!p) return;
    const row = i >> 3; // 0 = fila superior de la imagen
    const white = p === p.toUpperCase();
    const pr = RANK_PRIOR[p.toUpperCase() === 'P' ? 'P' : p.toUpperCase() === 'K' ? 'K' : 'X'];
    const rankNormal = white ? 7 - row : row; // índice 0..7 de fila "propia" si la vista es normal
    const rankFlipped = 7 - rankNormal;
    llr += Math.log(pr[rankNormal]) - Math.log(pr[rankFlipped]);
  });
  return llr;
}
function decideOrientation(grid, rank1) {
  if (rank1 && rank1.conf > 0.45) return { flipped: rank1.v < 0.5, why: 'rank1' };
  let score = orientationScore(grid);
  if (rank1 && rank1.conf > 0.2) score += (rank1.v > 0.5 ? 1 : -1) * 2;
  return { flipped: score < 0, why: 'pieces', score };
}

function decideTurn(grid, flipped, lmEnd) {
  let turn = flipped ? 'b' : 'w';
  const best = lmEnd.filter((d) => d.conf > 0.3).sort((a, b) => b.conf - a.conf)[0];
  if (best) {
    const c = Math.min(7, Math.max(0, Math.floor(best.u * 8))), r = Math.min(7, Math.max(0, Math.floor(best.v * 8)));
    const p = grid[r * 8 + c];
    if (p) turn = p === p.toUpperCase() ? 'b' : 'w';
  }
  return turn;
}

/* ------------------------- API principal ------------------------- */
// source: HTMLImageElement | ImageBitmap | canvas. options.quad: esquinas manuales (coords de la imagen original, TL,TR,BR,BL)
// options.mode: 'auto' | 'books' | 'screens'
export async function recognize(source, options = {}) {
  const t0 = performance.now();
  const T = {}; let tm = t0; const mark = (k) => { const n = performance.now(); T[k] = Math.round(n - tm); tm = n; };
  const progress = options.onProgress || (() => {});
  const mode = options.mode || 'auto';
  const src = imageToData(source, 2048); // para rectificar
  const det = imageToData(source, 1024); // para detectar
  const s2d = det.w / src.w;
  const gray = toGray(det.data, det.w, det.h);
  mark('decode');
  let quad, how;
  let fullDets = [];

  if (options.quad) {
    progress('Ajustando tu encuadre...'); await tick();
    const q0 = options.quad.map(([x, y]) => [x * det.scale, y * det.scale]);
    clearGradCache();
    const G = gradField(gray, det.w, det.h, Math.max(0.8, squareSize(q0) / 10));
    const r = refineQuad(G, q0, 0.2, 0.02);
    const before = checkerScore(gray, det.w, det.h, q0), after = checkerScore(gray, det.w, det.h, r.quad);
    const qd = (after.frac >= before.frac - 0.02) ? r.quad : q0;
    quad = qd.map(([x, y]) => [x / s2d, y / s2d]);
    how = 'manual';
  } else {
    progress('Buscando el tablero...'); await tick();
    const candidates = [];
    try {
      fullDets = await runYolo(det, 0.1);
      const boards = fullDets.filter((d) => d.cls === 0).sort((a, b) => b.conf - a.conf);
      if (boards[0]) candidates.push({ name: 'yolo', quad: quadFromAABB(boards[0].x1, boards[0].y1, boards[0].x2, boards[0].y2) });
    } catch (e) { console.warn('YOLO no disponible', e); }
    try {
      const prob = await runUnet(det);
      const q = quadFromMask(prob, det.w, det.h);
      if (q) candidates.push({ name: 'unet', quad: q });
    } catch (e) { console.warn('U-Net no disponible', e); }
    mark('nets');
    progress('Encajando la cuadrícula...'); await tick();
    const best = chooseBoardQuad(gray, det.w, det.h, candidates);
    mark('lattice+refine');
    if (!best) return null;
    quad = best.quad.map(([x, y]) => [x / s2d, y / s2d]);
    how = best.name;
    if (best.frac < 0.7 && best.ls < 1.2) return { failed: true, quad: scaleQuad(quad, 1 / src.scale) };
  }

  // Rotación del tablero en la imagen (las piezas deben quedar "de pie")
  progress('Leyendo las piezas...'); await tick();
  const q = orderQuad(quad);
  const k4 = await tileProbs(src, q, [0, 1, 2, 3], false);
  const kscore = k4.map((P) => { let s = 0; for (let i = 0; i < 64; i++) { let m = 0; for (let c = 0; c < 13; c++) m = Math.max(m, P[i * 13 + c]); s += Math.log(m + 1e-6); } return s / 64; });
  const order = [0, 1, 2, 3].sort((a, b) => kscore[b] - kscore[a]);
  let k = order[0];
  mark('rot4');
  let yoloBoard = null;
  if (kscore[order[0]] - kscore[order[1]] < 0.08) {
    const cand = [order[0], order[1]];
    const ys = [];
    for (const kk of cand) {
      const yb = await yoloOnBoard(src, q, kk);
      let s = 0; for (let i = 0; i < 64; i++) { let m = 0; for (let c = 0; c < 13; c++) m = Math.max(m, yb.P[i * 13 + c]); if (m > 0.25) s += m; }
      ys.push({ kk, yb, score: kscore[kk] + 0.05 * s });
    }
    ys.sort((a, b) => b.score - a.score);
    k = ys[0].kk; yoloBoard = ys[0].yb;
  }
  const [Pt] = await tileProbs(src, q, [k], true);
  if (!yoloBoard) yoloBoard = await yoloOnBoard(src, q, k);
  mark('classify');

  const colour = colorfulness(yoloBoard.extra.rect);
  const mono = mode === 'books' || (mode === 'auto' && colour < 14);
  const wy = mode === 'screens' ? 0.6 : (mono ? 0 : 0.4);
  const E = yoloToProbs(yoloBoard.P);
  const L = new Float64Array(64 * 13);
  for (let i = 0; i < 64 * 13; i++) L[i] = Math.log(Pt[i] + 1e-4) + wy * Math.log(E[i] * 0.9 + 0.1 / 13);
  const grid = decodeWithRules(L);

  // confianza por casilla (para resaltar dudas en la interfaz)
  const conf = [];
  for (let i = 0; i < 64; i++) {
    let mx = -Infinity; for (let c = 0; c < 13; c++) mx = Math.max(mx, L[i * 13 + c]);
    let z = 0; for (let c = 0; c < 13; c++) z += Math.exp(L[i * 13 + c] - mx);
    const lab = grid[i] ? IDX[grid[i]] : 0;
    conf.push(Math.exp(L[i * 13 + lab] - mx) / z);
  }

  // Marcador del número «1» (YOLO): sobre el tablero rectificado y sobre la imagen completa
  let rank1 = yoloBoard.extra.rank1;
  const Hd = homographyFromQuad(rollQuad(q, k).map(([x, y]) => [x * s2d, y * s2d]));
  const Hinv = Hd && invert3x3(Hd);
  for (const d of fullDets) {
    if (d.cls !== 13 || !Hinv) continue;
    const [u, v] = applyH(Hinv, d.cx, d.cy);
    if (u < -0.3 || u > 1.3 || v < -0.3 || v > 1.3) continue;
    if (!rank1 || d.conf > rank1.conf) rank1 = { conf: d.conf, u, v };
  }
  const orient = decideOrientation(grid, rank1);
  const flipped = orient.flipped;
  const turn = decideTurn(grid, flipped, yoloBoard.extra.lmEnd);
  const squares = flipped ? [...grid].reverse() : grid;
  const displayQuad = rollQuad(q, k).map(([x, y]) => [x / src.scale, y / src.scale]);
  return {
    squares, flipped, turn, conf: flipped ? [...conf].reverse() : conf,
    quad: displayQuad, how, mono, ms: Math.round(performance.now() - t0), orient,
    debugRect: options.debug ? yoloBoard.extra.rect : undefined, timings: T,
  };
}

function scaleQuad(q, s) { return q.map(([x, y]) => [x * s, y * s]); }
