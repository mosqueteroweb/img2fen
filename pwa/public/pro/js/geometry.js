// Geometría proyectiva: homografías, cuadriláteros y envolventes convexas.
// Convención: H mapea coordenadas normalizadas del tablero (u,v) ∈ [0,1]² a píxeles de la imagen.

export function homographyFromQuad(q) {
  // q: [[x,y] TL, TR, BR, BL]  -> H (array de 9) que lleva (0,0),(1,0),(1,1),(0,1) a q
  const [x0, y0] = q[0], [x1, y1] = q[1], [x2, y2] = q[2], [x3, y3] = q[3];
  const dx1 = x1 - x2, dx2 = x3 - x2, sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, sy = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 1e-12) return null;
    g = (sx * dy2 - sy * dx2) / det;
    h = (dx1 * sy - dy1 * sx) / det;
  }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

export function applyH(H, u, v) {
  const w = H[6] * u + H[7] * v + H[8];
  return [(H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w];
}

export function invert3x3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
  const G = b * f - c * e, Hh = -(a * f - c * d), I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) return null;
  const k = 1 / det;
  return [A * k, D * k, G * k, B * k, E * k, Hh * k, C * k, F * k, I * k];
}

export function mul3x3(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  }
  return r;
}

function solveLinear(A, b) {
  // eliminación gaussiana con pivoteo parcial (A n×n como array de arrays)
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

function normT(pts) {
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= pts.length; my /= pts.length;
  let d = 0;
  for (const [x, y] of pts) d += Math.hypot(x - mx, y - my);
  d /= pts.length;
  const s = d > 1e-9 ? Math.SQRT2 / d : 1;
  return [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1];
}

// Homografía por mínimos cuadrados (DLT normalizado, h33 = 1). src/dst: arrays de [x,y]
export function fitHomography(src, dst) {
  const n = src.length;
  if (n < 4) return null;
  const Ts = normT(src), Td = normT(dst);
  const ATA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const ATb = new Array(8).fill(0);
  const addRow = (row, rhs) => {
    for (let i = 0; i < 8; i++) {
      if (row[i] === 0) continue;
      ATb[i] += row[i] * rhs;
      for (let j = 0; j < 8; j++) ATA[i][j] += row[i] * row[j];
    }
  };
  for (let k = 0; k < n; k++) {
    const x = Ts[0] * src[k][0] + Ts[2], y = Ts[4] * src[k][1] + Ts[5];
    const X = Td[0] * dst[k][0] + Td[2], Y = Td[4] * dst[k][1] + Td[5];
    addRow([x, y, 1, 0, 0, 0, -X * x, -X * y], X);
    addRow([0, 0, 0, x, y, 1, -Y * x, -Y * y], Y);
  }
  const h = solveLinear(ATA, ATb);
  if (!h) return null;
  const Hn = [...h, 1];
  const TdInv = invert3x3(Td);
  const H = mul3x3(mul3x3(TdInv, Hn), Ts);
  const s = H[8];
  return H.map((v) => v / s);
}

export function squareSize(q) {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    s += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return s / 32;
}

// Ordena 4 puntos en sentido horario (con y hacia abajo) empezando por el de menor x+y.
export function orderQuad(pts) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
  const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
  const sorted = [...pts].sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let k = 0;
  for (let i = 1; i < 4; i++) if (sorted[i][0] + sorted[i][1] < sorted[k][0] + sorted[k][1]) k = i;
  return [0, 1, 2, 3].map((i) => sorted[(i + k) % 4].slice());
}

export function rollQuad(q, k) {
  return [0, 1, 2, 3].map((i) => q[(i + k) % 4].slice());
}

export function convexHull(points) {
  const p = points.map((a) => a.slice()).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// Cuadrilátero de área máxima con vértices en la envolvente.
export function fitQuadToHull(hull) {
  let h = hull;
  if (h.length > 60) {
    const s = [];
    for (let i = 0; i < 60; i++) s.push(h[Math.round(i * (h.length - 1) / 59)]);
    h = s;
  }
  const n = h.length;
  if (n < 4) return null;
  let best = null, ba = -1;
  for (let i = 0; i < n; i++) {
    for (let k = i + 2; k < n; k++) {
      if (n - (k - i) < 2) continue;
      const dx = h[k][0] - h[i][0], dy = h[k][1] - h[i][1];
      const cr = (p) => dx * (p[1] - h[i][1]) - dy * (p[0] - h[i][0]);
      let m1 = -1, j1 = -1;
      for (let j = i + 1; j < k; j++) { const c = Math.abs(cr(h[j])); if (c > m1) { m1 = c; j1 = j; } }
      let m2 = -1, j2 = -1;
      for (let j = k + 1; j < i + n; j++) { const c = Math.abs(cr(h[j % n])); if (c > m2) { m2 = c; j2 = j % n; } }
      const a = (m1 + m2) / 2;
      if (a > ba) { ba = a; best = [i, j1, k, j2]; }
    }
  }
  return best ? orderQuad(best.map((i) => h[i])) : null;
}

export function quadFromAABB(x1, y1, x2, y2) {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}

// Cuadrilátero que cubre las coordenadas de retícula [i0,i1]×[j0,j1] (en casillas; 0..8 = actual)
export function extrapolateQuad(q, i0, j0, i1, j1) {
  const H = homographyFromQuad(q);
  return [applyH(H, i0 / 8, j0 / 8), applyH(H, i1 / 8, j0 / 8), applyH(H, i1 / 8, j1 / 8), applyH(H, i0 / 8, j1 / 8)];
}
