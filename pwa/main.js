import * as ort from 'onnxruntime-web/wasm';
import { Chess } from 'chess.js';
import { registerSW } from 'virtual:pwa-register';

// Configure pure WebAssembly paths using absolute document URL (not relative to bundled /assets/)
const ROOT_URL = new URL('./', window.location.href).href;
ort.env.wasm.wasmPaths = `${ROOT_URL}wasm/`;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

const MODEL_PATH = `${ROOT_URL}model/chess-tiles-v2.onnx`;
const YOLO_MODEL_PATH = `${ROOT_URL}model/chess-yolo26n.onnx`;
const SEGMENTATION_MODEL_PATH = `${ROOT_URL}model/board-segmentation.onnx`;
const LABELS = '1KQRBNPkqrbnp';
const TILE_PX = 32;

const YOLO_CLASSES = {
  0: 'chessboard',
  1: 'p', 2: 'r', 3: 'b', 4: 'n', 5: 'k', 6: 'q',
  7: 'P', 8: 'R', 9: 'B', 10: 'N', 11: 'K', 12: 'Q',
  13: 'rank_one_id', 14: 'last_move_start', 15: 'last_move_end',
};

let sessionPromise = null;
let yoloSessionPromise = null;
let segmentationSessionPromise = null;

async function getYoloSession() {
  if (!yoloSessionPromise) {
    yoloSessionPromise = (async () => {
      try {
        const session = await ort.InferenceSession.create(YOLO_MODEL_PATH, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        console.log('ONNX YOLO26n 2D-Chess-OCR model loaded successfully in PWA!');
        return session;
      } catch (err) {
        console.warn('Failed to load YOLO26n model:', err);
        yoloSessionPromise = null;
        return null;
      }
    })();
  }
  return yoloSessionPromise;
}

async function getInferenceSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        const session = await ort.InferenceSession.create(MODEL_PATH, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        console.log('ONNX Tiles Model loaded successfully in PWA!');
        return session;
      } catch (err) {
        console.error('Failed to load ONNX tiles model:', err);
        sessionPromise = null;
        throw err;
      }
    })();
  }
  return sessionPromise;
}

async function getSegmentationSession() {
  if (!segmentationSessionPromise) {
    segmentationSessionPromise = (async () => {
      try {
        const session = await ort.InferenceSession.create(SEGMENTATION_MODEL_PATH, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        console.log('ONNX Board Segmentation model loaded successfully in PWA!');
        return session;
      } catch (err) {
        console.warn('Failed to load board segmentation model:', err);
        segmentationSessionPromise = null;
        return null;
      }
    })();
  }
  return segmentationSessionPromise;
}

/**
 * -------------------------------------------------------------
 * UI STATE
 * -------------------------------------------------------------
 */
let currentImage = null; // Image object
let activeColor = 'w';
let currentSquares = Array(64).fill(null); // pieces on 64 squares
let selectedSquareIndex = -1;
let isBoardViewFlipped = false; // true when displaying board from Black's perspective

// Crop transform state
let scale = 1.0;
let offsetX = 0.0;
let offsetY = 0.0;
let rotation = 0.0; // in degrees
let isRotating = false;
let rotationDismissTimer = null;

// 4 Independent Corner Control Points (in percentages 0..100 of viewport)
let gridCorners = {
  tl: { x: 5, y: 5 },    // Top-Left (A8)
  tr: { x: 95, y: 5 },   // Top-Right (H8)
  br: { x: 95, y: 95 },  // Bottom-Right (H1)
  bl: { x: 5, y: 95 }    // Bottom-Left (A1)
};
let activeHandle = null;

// Touch tracking
let touchStartDist = 0;
let touchStartAngle = 0;
let touchStartScale = 1;
let touchStartRotation = 0;
let touchStartPanX = 0;
let touchStartPanY = 0;
let isTouching = false;
let touchCount = 0;

let cachedViewportRect = null;
let animFrameRequested = false;
const svgGridLines = [];
let sharedGridCanvas = null;
let sharedYoloCanvas = null;

/**
 * -------------------------------------------------------------
 * DOM REFERENCES
 * -------------------------------------------------------------
 */
const screens = {
  home: document.getElementById('screen-home'),
  crop: document.getElementById('screen-crop'),
  result: document.getElementById('screen-result'),
};

const inputCamera = document.getElementById('input-camera');
const inputGallery = document.getElementById('input-gallery');
const historyList = document.getElementById('history-list');

const btnCropBack = document.getElementById('btn-crop-back');
const btnRotateCcw1 = document.getElementById('btn-rotate-ccw-1');
const btnRotateCw1 = document.getElementById('btn-rotate-cw-1');
const btnCropRotate90 = document.getElementById('btn-crop-rotate-90');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');
const btnAutoDetect = document.getElementById('btn-auto-detect');
const btnCornerFit = document.getElementById('btn-corner-fit');
const turnWhite = document.getElementById('turn-white');
const turnBlack = document.getElementById('turn-black');
const btnProcessScan = document.getElementById('btn-process-scan');

const cropViewport = document.getElementById('crop-viewport');
const cropCanvas = document.getElementById('crop-canvas');
const cropCtx = cropCanvas.getContext('2d');
const gridSvg = document.getElementById('grid-svg');
const gridMaskPath = document.getElementById('grid-mask-path');
const gridPolygon = document.getElementById('grid-polygon');
const gridInnerLines = document.getElementById('grid-inner-lines');
const cornerTL = document.getElementById('corner-tl');
const cornerTR = document.getElementById('corner-tr');
const cornerBR = document.getElementById('corner-br');
const cornerBL = document.getElementById('corner-bl');
const rotationBadge = document.getElementById('rotation-badge');

const chessboard = document.getElementById('chessboard');
const btnFlipView = document.getElementById('btn-flip-view');
const btnInvertBoard = document.getElementById('btn-invert-board');
const viewSideLabel = document.getElementById('view-side-label');
const fenText = document.getElementById('fen-text');
const btnCopyFen = document.getElementById('btn-copy-fen');
const btnOpenChesscom = document.getElementById('btn-open-chesscom');
const btnShareFen = document.getElementById('btn-share-fen');
const btnResultBack = document.getElementById('btn-result-back');
const btnResultNew = document.getElementById('btn-result-new');
const btnReopenCrop = document.getElementById('btn-reopen-crop');

const positionValidatorCard = document.getElementById('position-validator-card');
const validatorBadgeIcon = document.getElementById('validator-badge-icon');
const validatorStatusTitle = document.getElementById('validator-status-title');
const validatorDetails = document.getElementById('validator-details');

const pieceModal = document.getElementById('piece-modal');
const modalSquareLabel = document.getElementById('modal-square-label');
const btnClearSquare = document.getElementById('btn-clear-square');
const btnCancelModal = document.getElementById('btn-cancel-modal');

const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

/**
 * -------------------------------------------------------------
 * NAVIGATION & HELPERS
 * -------------------------------------------------------------
 */
function showScreen(name) {
  const allScreens = ['home', 'crop', 'result'];
  allScreens.forEach((key) => {
    const el = document.getElementById(`screen-${key}`);
    if (el) {
      el.classList.toggle('active', key === name);
    }
  });

  window.scrollTo({ top: 0, behavior: 'instant' });

  if (name === 'crop') {
    requestAnimationFrame(() => {
      renderCanvas();
      renderPerspectiveGrid();
    });
    setTimeout(() => {
      renderCanvas();
      renderPerspectiveGrid();
    }, 60);
  }
}

function showLoading(text) {
  loadingText.textContent = text;
  loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

/**
 * -------------------------------------------------------------
 * IMAGE LOADING & CROP CANVAS
 * -------------------------------------------------------------
 */
function handleFile(file) {
  if (!file) return;

  try {
    showLoading('Cargando imagen...');
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      try {
        URL.revokeObjectURL(objectUrl);
        currentImage = img;
        resetCropState();
        await processImageDirectlyToResult();
      } catch (err) {
        console.error('Error procesando imagen cargada:', err);
        hideLoading();
        showToast('⚠️ Imagen no reconocida. Ajusta el encuadre manualmente.', 3500);
        showScreen('crop');
        requestAnimationFrame(() => {
          renderCanvas();
          renderPerspectiveGrid();
        });
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      hideLoading();
      console.error('Error al decodificar la imagen:', err);
      showToast('⚠️ No se pudo leer el archivo de imagen.', 3000);
    };

    img.src = objectUrl;
  } catch (err) {
    hideLoading();
    console.error('Error en handleFile:', err);
    showToast('⚠️ Error al abrir el archivo de imagen.', 3000);
  }
}

function resetCropState() {
  scale = 1.0;
  offsetX = 0.0;
  offsetY = 0.0;
  rotation = 0.0;
  isRotating = false;
  gridCorners = {
    tl: { x: 5, y: 5 },
    tr: { x: 95, y: 5 },
    br: { x: 95, y: 95 },
    bl: { x: 5, y: 95 }
  };
  renderPerspectiveGrid();
  updateRotationBadge();
}

/**
 * -------------------------------------------------------------
 * PERSPECTIVE HOMOGRAPHY & 4-CORNER GEOMETRY
 * -------------------------------------------------------------
 */
function getHomographyFromUnitSquare(p0, p1, p2, p3) {
  const x0 = p0.x, y0 = p0.y;
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;

  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const sx = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sy = y0 - y1 + y2 - y3;

  if (Math.abs(sx) < 1e-7 && Math.abs(sy) < 1e-7) {
    return [
      x1 - x0, x3 - x0, x0,
      y1 - y0, y3 - y0, y0,
      0, 0, 1
    ];
  }

  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-7) return null;

  const g = (sx * dy2 - sy * dx2) / det;
  const h = (dx1 * sy - dy1 * sx) / det;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const c = x0;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const f = y0;

  return [a, b, c, d, e, f, g, h, 1];
}

function projectPoint(H, u, v) {
  const x = H[0] * u + H[1] * v + H[2];
  const y = H[3] * u + H[4] * v + H[5];
  const w = H[6] * u + H[7] * v + H[8];
  return { x: x / w, y: y / w };
}

function initGridSvgLines() {
  if (!gridInnerLines || svgGridLines.length === 14) return;
  gridInnerLines.innerHTML = '';
  for (let i = 0; i < 14; i++) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    gridInnerLines.appendChild(line);
    svgGridLines.push(line);
  }
}

function renderPerspectiveGrid(viewportRect = null) {
  if (!gridSvg || !cropViewport) return;

  const rect = viewportRect || cachedViewportRect || cropViewport.getBoundingClientRect();
  const w = rect.width || 400;
  const h = rect.height || 400;

  const p0 = { x: (gridCorners.tl.x / 100) * w, y: (gridCorners.tl.y / 100) * h }; // TL (A8)
  const p1 = { x: (gridCorners.tr.x / 100) * w, y: (gridCorners.tr.y / 100) * h }; // TR (H8)
  const p2 = { x: (gridCorners.br.x / 100) * w, y: (gridCorners.br.y / 100) * h }; // BR (H1)
  const p3 = { x: (gridCorners.bl.x / 100) * w, y: (gridCorners.bl.y / 100) * h }; // BL (A1)

  // Position 4 corner handles
  if (cornerTL) { cornerTL.style.left = `${gridCorners.tl.x}%`; cornerTL.style.top = `${gridCorners.tl.y}%`; }
  if (cornerTR) { cornerTR.style.left = `${gridCorners.tr.x}%`; cornerTR.style.top = `${gridCorners.tr.y}%`; }
  if (cornerBR) { cornerBR.style.left = `${gridCorners.br.x}%`; cornerBR.style.top = `${gridCorners.br.y}%`; }
  if (cornerBL) { cornerBL.style.left = `${gridCorners.bl.x}%`; cornerBL.style.top = `${gridCorners.bl.y}%`; }

  const H = getHomographyFromUnitSquare(p0, p1, p2, p3);
  if (!H) return;

  // Darkened outer mask with inner quadrilateral cutout (evenodd rule)
  if (gridMaskPath) {
    gridMaskPath.setAttribute(
      'd',
      `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} L ${p3.x.toFixed(1)} ${p3.y.toFixed(1)} L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Z`
    );
  }

  // Outer border polygon
  if (gridPolygon) {
    gridPolygon.setAttribute(
      'points',
      `${p0.x.toFixed(1)},${p0.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)}`
    );
  }

  // 14 perspective internal grid lines (7 vertical + 7 horizontal) - updated directly without DOM thrashing
  if (gridInnerLines) {
    if (svgGridLines.length < 14) initGridSvgLines();
    let lineIdx = 0;
    // Vertical perspective lines
    for (let k = 1; k < 8; k++) {
      const u = k / 8;
      const topPt = projectPoint(H, u, 0);
      const botPt = projectPoint(H, u, 1);
      const line = svgGridLines[lineIdx++];
      if (line) {
        line.setAttribute('x1', topPt.x.toFixed(1));
        line.setAttribute('y1', topPt.y.toFixed(1));
        line.setAttribute('x2', botPt.x.toFixed(1));
        line.setAttribute('y2', botPt.y.toFixed(1));
      }
    }
    // Horizontal perspective lines
    for (let k = 1; k < 8; k++) {
      const v = k / 8;
      const leftPt = projectPoint(H, 0, v);
      const rightPt = projectPoint(H, 1, v);
      const line = svgGridLines[lineIdx++];
      if (line) {
        line.setAttribute('x1', leftPt.x.toFixed(1));
        line.setAttribute('y1', leftPt.y.toFixed(1));
        line.setAttribute('x2', rightPt.x.toFixed(1));
        line.setAttribute('y2', rightPt.y.toFixed(1));
      }
    }
  }
}

/**
 * Rectifies the arbitrary quadrilateral from sourceCanvas into a square 256x256 canvas
 * using inverse perspective homography and bilinear interpolation.
 */
function extractWarpedBoard(sourceCanvas, H) {
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = 256;
  boardCanvas.height = 256;
  const bCtx = boardCanvas.getContext('2d', { willReadFrequently: true });
  const outputImgData = bCtx.createImageData(256, 256);
  const outData = outputImgData.data;

  const sCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  const srcData = sCtx.getImageData(0, 0, srcW, srcH).data;

  const inv256 = 1.0 / 256.0;

  for (let y = 0; y < 256; y++) {
    const v = (y + 0.5) * inv256;
    // Precalculate row invariants
    const px0 = H[1] * v + H[2];
    const py0 = H[4] * v + H[5];
    const pw0 = H[7] * v + H[8];
    const rowOffset = y * 256;

    for (let x = 0; x < 256; x++) {
      const u = (x + 0.5) * inv256;
      const px = H[0] * u + px0;
      const py = H[3] * u + py0;
      const pw = H[6] * u + pw0;
      const srcX = px / pw;
      const srcY = py / pw;

      const outIdx = (rowOffset + x) * 4;

      if (srcX >= 0 && srcX < srcW && srcY >= 0 && srcY < srcH) {
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = Math.min(x0 + 1, srcW - 1);
        const y1 = Math.min(y0 + 1, srcH - 1);

        const fx = srcX - x0;
        const fy = srcY - y0;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;

        outData[outIdx]     = (w00 * srcData[idx00]     + w10 * srcData[idx10]     + w01 * srcData[idx01]     + w11 * srcData[idx11]) | 0;
        outData[outIdx + 1] = (w00 * srcData[idx00 + 1] + w10 * srcData[idx10 + 1] + w01 * srcData[idx01 + 1] + w11 * srcData[idx11 + 1]) | 0;
        outData[outIdx + 2] = (w00 * srcData[idx00 + 2] + w10 * srcData[idx10 + 2] + w01 * srcData[idx01 + 2] + w11 * srcData[idx11 + 2]) | 0;
        outData[outIdx + 3] = 255;
      } else {
        outData[outIdx]     = 0;
        outData[outIdx + 1] = 0;
        outData[outIdx + 2] = 0;
        outData[outIdx + 3] = 255;
      }
    }
  }
  bCtx.putImageData(outputImgData, 0, 0);
  return boardCanvas;
}

function invert3x3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
  const G = b * f - c * e, H = -(a * f - c * d), I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-11) return null;
  const invDet = 1.0 / det;
  return [
    A * invDet, D * invDet, G * invDet,
    B * invDet, E * invDet, H * invDet,
    C * invDet, F * invDet, I * invDet
  ];
}

/**
 * Rectifies the arbitrary quadrilateral from sourceCanvas into a 640x640 canvas
 * with a context margin (e.g. 32px) so edge pieces retain full context for YOLO26n.
 */
function extractWarpedBoardWithMargin(sourceCanvas, H, size = 640, marginPx = 32) {
  const boardCanvas = document.createElement('canvas');
  boardCanvas.width = size;
  boardCanvas.height = size;
  const bCtx = boardCanvas.getContext('2d', { willReadFrequently: true });
  const outputImgData = bCtx.createImageData(size, size);
  const outData = outputImgData.data;

  const sCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  const srcData = sCtx.getImageData(0, 0, srcW, srcH).data;

  const innerSz = size - 2 * marginPx;
  const invInner = 1.0 / innerSz;

  for (let y = 0; y < size; y++) {
    const v = (y - marginPx + 0.5) * invInner;
    const px0 = H[1] * v + H[2];
    const py0 = H[4] * v + H[5];
    const pw0 = H[7] * v + H[8];
    const rowOffset = y * size;

    for (let x = 0; x < size; x++) {
      const u = (x - marginPx + 0.5) * invInner;
      const pw = H[6] * u + pw0;
      const srcX = (H[0] * u + px0) / pw;
      const srcY = (H[3] * u + py0) / pw;
      const outIdx = (rowOffset + x) * 4;

      if (srcX >= 0 && srcX < srcW && srcY >= 0 && srcY < srcH) {
        const x0 = srcX | 0;
        const y0 = srcY | 0;
        const inIdx = (y0 * srcW + x0) * 4;
        outData[outIdx]     = srcData[inIdx];
        outData[outIdx + 1] = srcData[inIdx + 1];
        outData[outIdx + 2] = srcData[inIdx + 2];
        outData[outIdx + 3] = 255;
      } else {
        outData[outIdx]     = 114;
        outData[outIdx + 1] = 114;
        outData[outIdx + 2] = 114;
        outData[outIdx + 3] = 255;
      }
    }
  }
  bCtx.putImageData(outputImgData, 0, 0);
  return { canvas: boardCanvas, marginPx, innerSz };
}

function updateRotationBadge() {
  const rounded = Math.round(((rotation % 360) + 360) % 360);
  const normalized = rounded > 180 ? rounded - 360 : rounded;
  if (isRotating && normalized !== 0) {
    rotationBadge.textContent = `↺ ${normalized > 0 ? '+' : ''}${normalized}°`;
    rotationBadge.classList.remove('hidden');
  } else {
    rotationBadge.classList.add('hidden');
  }
}

function setRotatingActive() {
  isRotating = true;
  updateRotationBadge();
  clearTimeout(rotationDismissTimer);
  rotationDismissTimer = setTimeout(() => {
    isRotating = false;
    updateRotationBadge();
  }, 450);
}

function scheduleRender() {
  if (!animFrameRequested) {
    animFrameRequested = true;
    requestAnimationFrame(() => {
      animFrameRequested = false;
      renderCanvas(cachedViewportRect);
    });
  }
}

function renderCanvas(viewportRect = null) {
  if (!currentImage) return;

  const rect = viewportRect || cachedViewportRect || cropViewport.getBoundingClientRect();
  const width = Math.round(rect.width) || 400;
  const height = Math.round(rect.height) || 400;

  if (cropCanvas.width !== width || cropCanvas.height !== height) {
    cropCanvas.width = width;
    cropCanvas.height = height;
  }

  cropCtx.save();
  cropCtx.fillStyle = '#000000';
  cropCtx.fillRect(0, 0, width, height);

  cropCtx.translate(width / 2 + offsetX, height / 2 + offsetY);
  cropCtx.rotate((rotation * Math.PI) / 180);
  cropCtx.scale(scale, scale);

  // Fit image by default
  const baseScale = Math.min(width / currentImage.width, height / currentImage.height);
  const drawW = currentImage.width * baseScale;
  const drawH = currentImage.height * baseScale;

  cropCtx.drawImage(currentImage, -drawW / 2, -drawH / 2, drawW, drawH);
  cropCtx.restore();
  renderPerspectiveGrid(rect);
}

/**
 * -------------------------------------------------------------
 * TOUCH GESTURES (Pan, Zoom, 2-Finger Rotation)
 * -------------------------------------------------------------
 */
function getDistance(t1, t2) {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

function getAngle(t1, t2) {
  return (Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180) / Math.PI;
}

cropViewport.addEventListener('touchstart', (e) => {
  cachedViewportRect = cropViewport.getBoundingClientRect();
  const handleEl = e.target.closest('.grid-handle');
  if (handleEl) {
    activeHandle = handleEl.dataset.handle;
    handleEl.classList.add('active');
    e.stopPropagation();
    return;
  }

  touchCount = e.touches.length;
  if (touchCount === 1) {
    isTouching = true;
    touchStartPanX = e.touches[0].clientX - offsetX;
    touchStartPanY = e.touches[0].clientY - offsetY;
  } else if (touchCount === 2) {
    isTouching = true;
    touchStartDist = getDistance(e.touches[0], e.touches[1]);
    touchStartAngle = getAngle(e.touches[0], e.touches[1]);
    touchStartScale = scale;
    touchStartRotation = rotation;
    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    touchStartPanX = midX - offsetX;
    touchStartPanY = midY - offsetY;
  }
}, { passive: false });

function updateGridFromPointer(clientX, clientY) {
  if (!activeHandle) return;
  const rect = cachedViewportRect || cropViewport.getBoundingClientRect();
  const pctX = Math.min(Math.max(((clientX - rect.left) / rect.width) * 100, 0), 100);
  const pctY = Math.min(Math.max(((clientY - rect.top) / rect.height) * 100, 0), 100);

  if (activeHandle === 'tl') {
    gridCorners.tl.x = pctX;
    gridCorners.tl.y = pctY;
  } else if (activeHandle === 'tr') {
    gridCorners.tr.x = pctX;
    gridCorners.tr.y = pctY;
  } else if (activeHandle === 'br') {
    gridCorners.br.x = pctX;
    gridCorners.br.y = pctY;
  } else if (activeHandle === 'bl') {
    gridCorners.bl.x = pctX;
    gridCorners.bl.y = pctY;
  }
  renderPerspectiveGrid(rect);
}

cropViewport.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (activeHandle && e.touches.length === 1) {
    updateGridFromPointer(e.touches[0].clientX, e.touches[0].clientY);
    return;
  }
  if (!isTouching) return;

  if (e.touches.length === 1 && touchCount === 1) {
    offsetX = e.touches[0].clientX - touchStartPanX;
    offsetY = e.touches[0].clientY - touchStartPanY;
    scheduleRender();
  } else if (e.touches.length === 2) {
    const currentDist = getDistance(e.touches[0], e.touches[1]);
    const currentAngle = getAngle(e.touches[0], e.touches[1]);

    const zoomFactor = currentDist / touchStartDist;
    scale = Math.min(Math.max(touchStartScale * zoomFactor, 0.5), 6.0);

    const angleDiff = currentAngle - touchStartAngle;
    if (Math.abs(angleDiff) > 1.0) {
      rotation = (touchStartRotation + angleDiff) % 360;
      setRotatingActive();
    }

    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    offsetX = midX - touchStartPanX;
    offsetY = midY - touchStartPanY;

    scheduleRender();
  }
}, { passive: false });

cropViewport.addEventListener('touchend', (e) => {
  touchCount = e.touches.length;
  if (touchCount === 0) {
    isTouching = false;
    if (activeHandle) {
      document.querySelectorAll('.grid-handle').forEach((h) => h.classList.remove('active'));
      activeHandle = null;
    }
  }
});

// Mouse dragging fallback for desktop
let isMouseDown = false;
let mouseStartX = 0;
let mouseStartY = 0;

cropViewport.addEventListener('mousedown', (e) => {
  cachedViewportRect = cropViewport.getBoundingClientRect();
  const handleEl = e.target.closest('.grid-handle');
  if (handleEl) {
    activeHandle = handleEl.dataset.handle;
    handleEl.classList.add('active');
    e.stopPropagation();
    return;
  }
  isMouseDown = true;
  mouseStartX = e.clientX - offsetX;
  mouseStartY = e.clientY - offsetY;
});

window.addEventListener('mousemove', (e) => {
  if (activeHandle) {
    updateGridFromPointer(e.clientX, e.clientY);
    return;
  }
  if (!isMouseDown) return;
  offsetX = e.clientX - mouseStartX;
  offsetY = e.clientY - mouseStartY;
  scheduleRender();
});

window.addEventListener('mouseup', () => {
  isMouseDown = false;
  if (activeHandle) {
    document.querySelectorAll('.grid-handle').forEach((h) => h.classList.remove('active'));
    activeHandle = null;
  }
});

window.addEventListener('resize', () => {
  if (screens.crop.classList.contains('active')) {
    cachedViewportRect = cropViewport.getBoundingClientRect();
    scheduleRender();
  }
});

cropViewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  scale = Math.min(Math.max(scale * delta, 0.5), 6.0);
  scheduleRender();
}, { passive: false });

/**
 * -------------------------------------------------------------
 * BUTTON CONTROLS (Zoom, Rotate ±1° / 90°, Turn)
 * -------------------------------------------------------------
 */
btnRotateCcw1?.addEventListener('click', () => {
  rotation = (rotation - 1) % 360;
  setRotatingActive();
  renderCanvas();
});

btnRotateCw1?.addEventListener('click', () => {
  rotation = (rotation + 1) % 360;
  setRotatingActive();
  renderCanvas();
});

btnCropRotate90?.addEventListener('click', () => {
  rotation = (rotation + 90) % 360;
  setRotatingActive();
  renderCanvas();
});

btnZoomIn.addEventListener('click', () => {
  scale = Math.min(scale * 1.2, 6.0);
  renderCanvas();
});

btnZoomOut.addEventListener('click', () => {
  scale = Math.max(scale / 1.2, 0.5);
  renderCanvas();
});

btnZoomReset.addEventListener('click', () => {
  resetCropState();
  renderCanvas();
});

let cornerPresetIndex = 0;
function cycleCornerPresets() {
  cornerPresetIndex = (cornerPresetIndex + 1) % 3;
  if (cornerPresetIndex === 0) {
    gridCorners = { tl: { x: 5, y: 5 }, tr: { x: 95, y: 5 }, br: { x: 95, y: 95 }, bl: { x: 5, y: 95 } };
    showToast('📐 Cuadrícula ajustada (90%)', 1500);
  } else if (cornerPresetIndex === 1) {
    gridCorners = { tl: { x: 15, y: 15 }, tr: { x: 85, y: 15 }, br: { x: 85, y: 85 }, bl: { x: 15, y: 85 } };
    showToast('📐 Cuadrícula centrada (70%)', 1500);
  } else {
    gridCorners = { tl: { x: 20, y: 15 }, tr: { x: 80, y: 15 }, br: { x: 92, y: 88 }, bl: { x: 8, y: 88 } };
    showToast('📐 Cuadrícula en perspectiva oblicua', 1500);
  }
  renderPerspectiveGrid();
}
btnCornerFit?.addEventListener('click', cycleCornerPresets);

turnWhite.addEventListener('click', () => {
  activeColor = 'w';
  turnWhite.classList.add('active');
  turnBlack.classList.remove('active');
  renderBoard();
  updateFenDisplay();
  saveToHistory(getFenString());
});

turnBlack.addEventListener('click', () => {
  activeColor = 'b';
  turnBlack.classList.add('active');
  turnWhite.classList.remove('active');
  renderBoard();
  updateFenDisplay();
  saveToHistory(getFenString());
});

btnCropBack.addEventListener('click', () => {
  if (currentSquares && currentSquares.some((s) => s !== null)) {
    showScreen('result');
  } else {
    showScreen('home');
  }
});

btnResultBack.addEventListener('click', () => showScreen('home'));
btnResultNew.addEventListener('click', () => showScreen('home'));

btnReopenCrop?.addEventListener('click', () => {
  showScreen('crop');
  renderPerspectiveGrid();
  requestAnimationFrame(renderCanvas);
});

/**
 * -------------------------------------------------------------
 * SMART CHESSBOARD DETECTION:
 * 1. Periodic 1D Gradient Projection + Bimodal 2-Color Checkerboard Verification
 * 2. Fallback to U-Net Neural Segmentation for angled/tilted photos
 * -------------------------------------------------------------
 */
function detectChessboardByGridAndColor(img) {
  try {
    const origW = img.width;
    const origH = img.height;
    if (!origW || !origH) return null;

    // Scale to max 512px for lightning-fast sub-5ms projection analysis
    const maxDim = 512;
    const scale = Math.min(1.0, maxDim / Math.max(origW, origH));
    const sw = Math.round(origW * scale);
    const sh = Math.round(origH * scale);

    if (!sharedGridCanvas) {
      sharedGridCanvas = document.createElement('canvas');
    }
    sharedGridCanvas.width = sw;
    sharedGridCanvas.height = sh;
    const ctx = sharedGridCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, sw, sh);

    const imgData = ctx.getImageData(0, 0, sw, sh).data;
    const gray = new Uint8Array(sw * sh);
    for (let i = 0; i < gray.length; i++) {
      const idx = i * 4;
      gray[i] = (imgData[idx] * 299 + imgData[idx + 1] * 587 + imgData[idx + 2] * 114) / 1000;
    }

    // 1D Gradient Projections
    const colGrad = new Float32Array(sw);
    const rowGrad = new Float32Array(sh);

    // Stride 2 for speed
    for (let x = 1; x < sw - 1; x++) {
      let s = 0;
      for (let y = 1; y < sh - 1; y += 2) {
        const idxL = y * sw + (x - 1);
        const idxR = y * sw + (x + 1);
        s += Math.abs(gray[idxR] - gray[idxL]);
      }
      colGrad[x] = s;
    }

    for (let y = 1; y < sh - 1; y++) {
      let s = 0;
      const rowOffset = y * sw;
      const rowOffsetU = (y - 1) * sw;
      const rowOffsetD = (y + 1) * sw;
      for (let x = 1; x < sw - 1; x += 2) {
        s += Math.abs(gray[rowOffsetD + x] - gray[rowOffsetU + x]);
      }
      rowGrad[y] = s;
    }

    const minSz = Math.floor(Math.min(sw, sh) * 0.40);
    const maxSz = Math.floor(Math.min(sw, sh) * 1.0);

    let bestColScore = 0;
    let bestX0 = 0;
    let bestW = 0;
    let bestStep = 0;

    for (let size = minSz; size <= maxSz; size += 2) {
      const step = size / 8.0;
      for (let x0 = 0; x0 <= sw - size; x0 += 2) {
        let score = 0;
        for (let k = 0; k < 9; k++) {
          const xk = Math.round(x0 + k * step);
          let maxV = colGrad[xk];
          if (xk > 0 && colGrad[xk - 1] > maxV) maxV = colGrad[xk - 1];
          if (xk > 1 && colGrad[xk - 2] > maxV) maxV = colGrad[xk - 2];
          if (xk < sw - 1 && colGrad[xk + 1] > maxV) maxV = colGrad[xk + 1];
          if (xk < sw - 2 && colGrad[xk + 2] > maxV) maxV = colGrad[xk + 2];
          score += maxV;
        }
        if (score > bestColScore) {
          bestColScore = score;
          bestX0 = x0;
          bestW = size;
          bestStep = step;
        }
      }
    }

    if (bestColScore === 0) return null;

    // Search row grid with matching step
    const minRowSz = Math.floor(bestStep * 7.7);
    const maxRowSz = Math.ceil(bestStep * 8.3);

    let bestRowScore = 0;
    let bestY0 = 0;
    let bestH = 0;

    for (let size = minRowSz; size <= maxRowSz; size++) {
      const rStep = size / 8.0;
      for (let y0 = 0; y0 <= sh - size; y0 += 2) {
        let score = 0;
        for (let k = 0; k < 9; k++) {
          const yk = Math.round(y0 + k * rStep);
          let maxV = rowGrad[yk];
          if (yk > 0 && rowGrad[yk - 1] > maxV) maxV = rowGrad[yk - 1];
          if (yk > 1 && rowGrad[yk - 2] > maxV) maxV = rowGrad[yk - 2];
          if (yk < sh - 1 && rowGrad[yk + 1] > maxV) maxV = rowGrad[yk + 1];
          if (yk < sh - 2 && rowGrad[yk + 2] > maxV) maxV = rowGrad[yk + 2];
          score += maxV;
        }
        if (score > bestRowScore) {
          bestRowScore = score;
          bestY0 = y0;
          bestH = size;
        }
      }
    }

    if (bestRowScore === 0) return null;

    const aspect = bestW / bestH;
    if (aspect < 0.90 || aspect > 1.10) return null;

    // 2-Color Checkerboard contrast verification
    const stepX = bestW / 8.0;
    const stepY = bestH / 8.0;
    let lightSumR = 0, lightSumG = 0, lightSumB = 0, lightCount = 0;
    let darkSumR = 0, darkSumG = 0, darkSumB = 0, darkCount = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const px = Math.min(sw - 1, Math.max(0, Math.round(bestX0 + (c + 0.20) * stepX)));
        const py = Math.min(sh - 1, Math.max(0, Math.round(bestY0 + (r + 0.20) * stepY)));
        const idx = (py * sw + px) * 4;
        const R = imgData[idx];
        const G = imgData[idx + 1];
        const B = imgData[idx + 2];

        if ((r + c) % 2 === 0) {
          lightSumR += R; lightSumG += G; lightSumB += B; lightCount++;
        } else {
          darkSumR += R; darkSumG += G; darkSumB += B; darkCount++;
        }
      }
    }

    const avgLightR = lightSumR / lightCount;
    const avgLightG = lightSumG / lightCount;
    const avgLightB = lightSumB / lightCount;

    const avgDarkR = darkSumR / darkCount;
    const avgDarkG = darkSumG / darkCount;
    const avgDarkB = darkSumB / darkCount;

    const colorDist = Math.hypot(avgLightR - avgDarkR, avgLightG - avgDarkG, avgLightB - avgDarkB);
    if (colorDist < 20) {
      console.warn('[PWA] Grid detected but checkerboard color contrast is too low:', colorDist);
      return null;
    }

    // Map back to original image coordinates
    const invScale = 1.0 / scale;
    return {
      realXmin: Math.max(0, Math.round(bestX0 * invScale)),
      realXmax: Math.min(origW, Math.round((bestX0 + bestW) * invScale)),
      realYmin: Math.max(0, Math.round(bestY0 * invScale)),
      realYmax: Math.min(origH, Math.round((bestY0 + bestH) * invScale)),
      contrast: colorDist,
      method: 'grid-projection'
    };
  } catch (err) {
    console.warn('[PWA] detectChessboardByGridAndColor error:', err);
    return null;
  }
}

async function detectBoardBounds(img) {
  // 1. Try high-precision periodic grid & 2-color detector (takes ~5ms)
  const gridBounds = detectChessboardByGridAndColor(img);
  if (gridBounds) {
    console.log('[PWA] Board detected via Periodic Grid & Color Detector:', gridBounds);
    return gridBounds;
  }

  // 2. Fallback to U-Net neural segmentation
  console.log('[PWA] Falling back to U-Net segmentation...');
  return await detectBoardBoundsWithUNet(img);
}

async function detectBoardBoundsWithUNet(img) {
  try {
    const session = await getSegmentationSession();
    if (!session) return null;

    // 1. Render to 256x256 offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 256, 256);

    const imgData = ctx.getImageData(0, 0, 256, 256);
    const data = imgData.data;

    // 2. Prepare NCHW float32 tensor
    const tensorData = new Float32Array(3 * 256 * 256);
    const channelSize = 256 * 256;

    for (let i = 0; i < channelSize; i++) {
      const idx = i * 4;
      tensorData[i] = data[idx] / 255.0; // R
      tensorData[channelSize + i] = data[idx + 1] / 255.0; // G
      tensorData[channelSize * 2 + i] = data[idx + 2] / 255.0; // B
    }

    const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, 256, 256]);
    let rawOutput = null;
    let results = null;
    try {
      results = await session.run({ input: inputTensor });
      rawOutput = new Float32Array(results.output.data);
    } finally {
      inputTensor.dispose?.();
      results?.output?.dispose?.();
    }

    // 3. Threshold probability > 0.5 to create binary mask
    const binary = new Uint8Array(256 * 256);
    let positiveCount = 0;
    for (let i = 0; i < 256 * 256; i++) {
      const prob = 1.0 / (1.0 + Math.exp(-rawOutput[i]));
      if (prob > 0.5) {
        binary[i] = 1;
        positiveCount++;
      }
    }

    if (positiveCount < 1000) return null;

    // 4. Find largest connected component (BFS) to eliminate noise
    const labels = new Int32Array(256 * 256);
    const queue = new Int32Array(256 * 256);
    let currentLabel = 0;
    const componentSizes = {};

    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const startIdx = (y << 8) + x;
        if (binary[startIdx] === 1 && labels[startIdx] === 0) {
          currentLabel++;
          let head = 0;
          let tail = 0;
          queue[tail++] = startIdx;
          labels[startIdx] = currentLabel;

          while (head < tail) {
            const curr = queue[head++];
            const cy = curr >> 8;
            const cx = curr & 255;

            if (cy > 0) {
              const n = ((cy - 1) << 8) + cx;
              if (binary[n] === 1 && labels[n] === 0) { labels[n] = currentLabel; queue[tail++] = n; }
            }
            if (cy < 255) {
              const n = ((cy + 1) << 8) + cx;
              if (binary[n] === 1 && labels[n] === 0) { labels[n] = currentLabel; queue[tail++] = n; }
            }
            if (cx > 0) {
              const n = (cy << 8) + (cx - 1);
              if (binary[n] === 1 && labels[n] === 0) { labels[n] = currentLabel; queue[tail++] = n; }
            }
            if (cx < 255) {
              const n = (cy << 8) + (cx + 1);
              if (binary[n] === 1 && labels[n] === 0) { labels[n] = currentLabel; queue[tail++] = n; }
            }
          }
          componentSizes[currentLabel] = tail;
        }
      }
    }

    let maxLabel = 0;
    let maxSize = 0;
    for (const [lbl, sz] of Object.entries(componentSizes)) {
      if (sz > maxSize) {
        maxSize = sz;
        maxLabel = parseInt(lbl, 10);
      }
    }

    if (maxSize < 1000) return null;

    // 5. Bounding box in 256x256
    let minX = 256, maxX = 0, minY = 256, maxY = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        if (labels[(y << 8) + x] === maxLabel) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // Add 1.2% margin so borders are not cut
    const padX = Math.round((maxX - minX) * 0.012);
    const padY = Math.round((maxY - minY) * 0.012);
    minX = Math.max(0, minX - padX);
    maxX = Math.min(256, maxX + padX);
    minY = Math.max(0, minY - padY);
    maxY = Math.min(256, maxY + padY);

    const origW = img.width;
    const origH = img.height;
    return {
      realXmin: (minX / 256) * origW,
      realXmax: (maxX / 256) * origW,
      realYmin: (minY / 256) * origH,
      realYmax: (maxY / 256) * origH,
    };
  } catch (err) {
    console.warn('[PWA] detectBoardBoundsWithUNet error:', err);
    return null;
  }
}

/**
 * -------------------------------------------------------------
 * YOLO26n 2D-CHESS-OCR OBJECT DETECTOR & TRAPEZOID REFINEMENT
 * -------------------------------------------------------------
 */
async function runYolo26OnSource(source, origW, origH) {
  const session = await getYoloSession();
  if (!session) return null;

  const scaleFactor = Math.min(640 / origW, 640 / origH);
  const nw = Math.round(origW * scaleFactor);
  const nh = Math.round(origH * scaleFactor);
  const padX = Math.floor((640 - nw) / 2);
  const padY = Math.floor((640 - nh) / 2);

  if (!sharedYoloCanvas) {
    sharedYoloCanvas = document.createElement('canvas');
    sharedYoloCanvas.width = 640;
    sharedYoloCanvas.height = 640;
  }
  const yCtx = sharedYoloCanvas.getContext('2d', { willReadFrequently: true });
  yCtx.fillStyle = '#727272';
  yCtx.fillRect(0, 0, 640, 640);
  yCtx.drawImage(source, 0, 0, origW, origH, padX, padY, nw, nh);

  const imgData = yCtx.getImageData(0, 0, 640, 640).data;
  const ch640 = 640 * 640;
  const tensorData = new Float32Array(3 * ch640);
  const inv255 = 1.0 / 255.0;

  for (let i = 0; i < ch640; i++) {
    const idx = i * 4;
    tensorData[i] = imgData[idx] * inv255;
    tensorData[ch640 + i] = imgData[idx + 1] * inv255;
    tensorData[2 * ch640 + i] = imgData[idx + 2] * inv255;
  }

  const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, 640, 640]);
  let rawOut = null;
  let results = null;
  try {
    const inputName = session.inputNames[0] || 'images';
    const outputName = session.outputNames[0] || 'output0';
    results = await session.run({ [inputName]: inputTensor });
    rawOut = new Float32Array(results[outputName].data);
  } finally {
    inputTensor.dispose?.();
    if (results) {
      for (const k of Object.keys(results)) {
        results[k]?.dispose?.();
      }
    }
  }

  let boardBox = null;
  const pieces = [];
  let rankOneDet = null;
  const lmStarts = [];
  const lmEnds = [];

  const invScale = 1.0 / scaleFactor;
  for (let i = 0; i < 300; i++) {
    const base = i * 6;
    const conf = rawOut[base + 4];
    if (conf < 0.22) continue;

    const x1 = (rawOut[base] - padX) * invScale;
    const y1 = (rawOut[base + 1] - padY) * invScale;
    const x2 = (rawOut[base + 2] - padX) * invScale;
    const y2 = (rawOut[base + 3] - padY) * invScale;
    const cls = Math.round(rawOut[base + 5]);
    const entry = {
      x1, y1, x2, y2,
      cx: (x1 + x2) * 0.5,
      cy: (y1 + y2) * 0.5,
      conf,
      cls,
      name: YOLO_CLASSES[cls],
    };

    if (cls === 0 && (!boardBox || conf > boardBox.conf)) {
      boardBox = entry;
    } else if (cls >= 1 && cls <= 12) {
      pieces.push(entry);
    } else if (cls === 13 && (!rankOneDet || conf > rankOneDet.conf)) {
      rankOneDet = entry;
    } else if (cls === 14) {
      lmStarts.push(entry);
    } else if (cls === 15) {
      lmEnds.push(entry);
    }
  }

  return { boardBox, pieces, rankOneDet, lmStarts, lmEnds };
}

function fitTrapezoidCorners(boardBox, pieces, origW, origH) {
  let { x1, y1, x2, y2 } = boardBox;
  const bw = x2 - x1;
  const bh = y2 - y1;

  for (const p of pieces) {
    if (
      p.conf > 0.5 &&
      p.cx >= x1 - 0.08 * bw &&
      p.cx <= x2 + 0.08 * bw &&
      p.cy >= y1 - 0.05 * bh &&
      p.cy <= y2 + 0.05 * bh
    ) {
      if (p.y1 < y1) y1 = p.y1;
      if (p.y2 > y2) y2 = p.y2;
    }
  }

  let topLeftMin = x1, topRightMax = x2;
  let botLeftMin = x1, botRightMax = x2;

  for (const p of pieces) {
    if (
      p.conf > 0.5 &&
      p.cy >= y1 &&
      p.cy <= y2 &&
      p.cx >= x1 - 0.08 * bw &&
      p.cx <= x2 + 0.08 * bw
    ) {
      const relY = (p.cy - y1) / Math.max(1, y2 - y1);
      if (relY < 0.35) {
        if (p.x1 < topLeftMin) topLeftMin = p.x1;
        if (p.x2 > topRightMax) topRightMax = p.x2;
      } else if (relY > 0.65) {
        if (p.x1 < botLeftMin) botLeftMin = p.x1;
        if (p.x2 > botRightMax) botRightMax = p.x2;
      }
    }
  }

  return {
    tl: { x: Math.max(0, topLeftMin), y: Math.max(0, y1) },
    tr: { x: Math.min(origW, topRightMax), y: Math.max(0, y1) },
    br: { x: Math.min(origW, botRightMax), y: Math.min(origH, y2) },
    bl: { x: Math.max(0, botLeftMin), y: Math.min(origH, y2) },
  };
}

function detectOrientationAndTurn(grid, rankOneDet, boardBox, lmEnds, pieces) {
  let isFlipped = false;

  if (rankOneDet && boardBox && rankOneDet.conf > 0.45) {
    const boardCy = (boardBox.y1 + boardBox.y2) * 0.5;
    isFlipped = rankOneDet.cy < boardCy;
  } else {
    let whiteTop = 0, whiteBot = 0;
    let blackTop = 0, blackBot = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = grid[r * 8 + c];
        if (!p) continue;
        if (p === 'P') {
          if (r < 4) whiteTop += 2;
          else whiteBot += 2;
        } else if (p === 'p') {
          if (r < 4) blackTop += 2;
          else blackBot += 2;
        } else if (p === 'K' || p === 'R' || p === 'Q') {
          if (r <= 1) whiteTop += 1;
          else if (r >= 6) whiteBot += 1;
        } else if (p === 'k' || p === 'r' || p === 'q') {
          if (r <= 1) blackTop += 1;
          else if (r >= 6) blackBot += 1;
        }
      }
    }
    const standardScore = blackTop + whiteBot;
    const flippedScore = whiteTop + blackBot;
    if (flippedScore > standardScore) {
      isFlipped = true;
    }
  }

  // Default turn to the player at the bottom of the diagram (White if normal, Black if flipped)
  let turn = isFlipped ? 'b' : 'w';

  if (lmEnds && lmEnds.length > 0 && pieces && pieces.length > 0) {
    const bestEnd = lmEnds[0];
    let bestPiece = null;
    for (const p of pieces) {
      if (p.cx >= bestEnd.x1 && p.cx <= bestEnd.x2 && p.cy >= bestEnd.y1 && p.cy <= bestEnd.y2) {
        if (!bestPiece || p.conf > bestPiece.conf) bestPiece = p;
      }
    }
    if (bestPiece) {
      const isBlackPiece = bestPiece.cls >= 1 && bestPiece.cls <= 6;
      turn = isBlackPiece ? 'w' : 'b';
    }
  }

  return { isFlipped, turn };
}

function syncTurnButtonsUI() {
  if (activeColor === 'b') {
    turnBlack?.classList.add('active');
    turnWhite?.classList.remove('active');
  } else {
    turnWhite?.classList.add('active');
    turnBlack?.classList.remove('active');
  }
}

function applyCornersToCropView(corners, zoomIn = false) {
  if (!currentImage) return;
  const rect = cropViewport?.getBoundingClientRect();
  const viewportPx = (rect && rect.width) ? rect.width : 400;
  const baseScale = Math.min(viewportPx / currentImage.width, viewportPx / currentImage.height);
  const drawW = currentImage.width * baseScale;
  const drawH = currentImage.height * baseScale;
  const drawLeft = (viewportPx - drawW) / 2;
  const drawTop = (viewportPx - drawH) / 2;

  const minX = Math.min(corners.tl.x, corners.bl.x);
  const maxX = Math.max(corners.tr.x, corners.br.x);
  const minY = Math.min(corners.tl.y, corners.tr.y);
  const maxY = Math.max(corners.bl.y, corners.br.y);

  if (zoomIn) {
    const boardOnScreenW = (maxX - minX) * baseScale;
    const boardOnScreenH = (maxY - minY) * baseScale;
    const targetScale = Math.min(Math.max((viewportPx * 0.90) / Math.max(boardOnScreenW, boardOnScreenH, 1), 1.0), 4.0);
    const boardCenterImgX = (minX + maxX) / 2;
    const boardCenterImgY = (minY + maxY) / 2;
    const screenBoardCenterX = drawLeft + boardCenterImgX * baseScale;
    const screenBoardCenterY = drawTop + boardCenterImgY * baseScale;

    scale = targetScale;
    offsetX = (viewportPx / 2 - screenBoardCenterX) * targetScale;
    offsetY = (viewportPx / 2 - screenBoardCenterY) * targetScale;
    rotation = 0;

    const mapPt = (pt) => {
      const sx = drawLeft + pt.x * baseScale;
      const sy = drawTop + pt.y * baseScale;
      const vx = (sx - viewportPx / 2) * targetScale + viewportPx / 2 + offsetX;
      const vy = (sy - viewportPx / 2) * targetScale + viewportPx / 2 + offsetY;
      return {
        x: Math.max(1, Math.min(99, (vx / viewportPx) * 100)),
        y: Math.max(1, Math.min(99, (vy / viewportPx) * 100)),
      };
    };
    gridCorners = {
      tl: mapPt(corners.tl),
      tr: mapPt(corners.tr),
      br: mapPt(corners.br),
      bl: mapPt(corners.bl),
    };
  } else {
    scale = 1.0;
    offsetX = 0;
    offsetY = 0;
    rotation = 0;
    const mapPt = (pt) => ({
      x: Math.max(1, Math.min(99, ((drawLeft + pt.x * baseScale) / viewportPx) * 100)),
      y: Math.max(1, Math.min(99, ((drawTop + pt.y * baseScale) / viewportPx) * 100)),
    });
    gridCorners = {
      tl: mapPt(corners.tl),
      tr: mapPt(corners.tr),
      br: mapPt(corners.br),
      bl: mapPt(corners.bl),
    };
  }
}

async function autoDetectChessboardWithAI(manual = false) {
  if (!currentImage) return;

  try {
    if (manual) showToast('🔍 Detectando tablero con IA...');

    const yoloRes = await runYolo26OnSource(currentImage, currentImage.width, currentImage.height);
    if (yoloRes && yoloRes.boardBox) {
      const corners = fitTrapezoidCorners(yoloRes.boardBox, yoloRes.pieces, currentImage.width, currentImage.height);
      applyCornersToCropView(corners, true);
      renderPerspectiveGrid();
      renderCanvas();
      showToast('✨ Tablero y perspectiva encuadrados con IA', 2500);
      return;
    }

    const bounds = await detectBoardBounds(currentImage);
    if (!bounds) {
      if (manual) showToast('No se detectó un tablero claro en la foto.');
      return;
    }

    applyCornersToCropView({
      tl: { x: bounds.realXmin, y: bounds.realYmin },
      tr: { x: bounds.realXmax, y: bounds.realYmin },
      br: { x: bounds.realXmax, y: bounds.realYmax },
      bl: { x: bounds.realXmin, y: bounds.realYmax },
    }, true);

    renderPerspectiveGrid();
    renderCanvas();
    showToast('✨ Tablero encuadrado automáticamente con IA', 2500);
  } catch (err) {
    console.warn('[PWA] Error en autoDetectChessboardWithAI:', err);
    if (manual) showToast('Error al analizar la imagen.');
  }
}

btnAutoDetect?.addEventListener('click', () => autoDetectChessboardWithAI(true));

/**
 * -------------------------------------------------------------
 * END-TO-END PIPELINE: IMAGE -> YOLO26n + HYBRID ENSEMBLE -> RESULT
 * -------------------------------------------------------------
 */
async function processImageDirectlyToResult() {
  if (!currentImage) return;

  try {
    showLoading('Reconociendo posición con IA...');

    // 1. Primary Pass: YOLO26n 2D-Chess-OCR (detects board, pieces, orientation & turn in 1 pass)
    const yoloRes = await runYolo26OnSource(currentImage, currentImage.width, currentImage.height);

    if (yoloRes && yoloRes.boardBox && yoloRes.pieces.length >= 2) {
      const corners = fitTrapezoidCorners(yoloRes.boardBox, yoloRes.pieces, currentImage.width, currentImage.height);
      applyCornersToCropView(corners, false);

      const H = getHomographyFromUnitSquare(corners.tl, corners.tr, corners.br, corners.bl);
      const Hinv = H ? invert3x3(H) : null;

      if (Hinv) {
        const grid = Array(64).fill(null);
        const gridConf = Array(64).fill(0);
        let matchedCount = 0;

        for (const p of yoloRes.pieces) {
          const u = Hinv[0] * p.cx + Hinv[1] * p.cy + Hinv[2];
          const v = Hinv[3] * p.cx + Hinv[4] * p.cy + Hinv[5];
          const w = Hinv[6] * p.cx + Hinv[7] * p.cy + Hinv[8];
          const normU = u / w;
          const normV = v / w;

          if (normU >= -0.04 && normU <= 1.04 && normV >= -0.04 && normV <= 1.04) {
            const col = Math.min(7, Math.max(0, Math.floor(normU * 8)));
            const row = Math.min(7, Math.max(0, Math.floor(normV * 8)));
            const idx = row * 8 + col;
            if (p.conf > gridConf[idx]) {
              if (!grid[idx]) matchedCount++;
              grid[idx] = p.name;
              gridConf[idx] = p.conf;
            }
          }
        }

        if (matchedCount >= 2) {
          const { isFlipped, turn } = detectOrientationAndTurn(
            grid,
            yoloRes.rankOneDet,
            yoloRes.boardBox,
            yoloRes.lmEnds,
            yoloRes.pieces
          );
          currentSquares = isFlipped ? [...grid].reverse() : grid;
          isBoardViewFlipped = isFlipped;
          activeColor = turn;
          syncTurnButtonsUI();

          renderBoard();
          updateFenDisplay();
          saveToHistory(getFenString());
          showScreen('result');
          showToast(
            isFlipped
              ? '✨ Posición reconocida (Vista desde Negras)'
              : '✨ Posición reconocida al instante con IA',
            2800
          );
          return;
        }
      }
    }

    // 2. Fallback: Periodic Grid + U-Net segmentation + Tile Classifier
    const bounds = await detectBoardBounds(currentImage);

    if (!bounds) {
      hideLoading();
      showToast('⚠️ No se reconoció el tablero automáticamente. Ajusta las esquinas.', 4000);
      gridCorners = {
        tl: { x: 10, y: 10 },
        tr: { x: 90, y: 10 },
        br: { x: 90, y: 90 },
        bl: { x: 10, y: 90 }
      };
      showScreen('crop');
      requestAnimationFrame(() => {
        renderCanvas();
        renderPerspectiveGrid();
      });
      return;
    }

    applyCornersToCropView({
      tl: { x: bounds.realXmin, y: bounds.realYmin },
      tr: { x: bounds.realXmax, y: bounds.realYmin },
      br: { x: bounds.realXmax, y: bounds.realYmax },
      bl: { x: bounds.realXmin, y: bounds.realYmax },
    }, false);

    const boardCanvas = document.createElement('canvas');
    boardCanvas.width = 256;
    boardCanvas.height = 256;
    const bCtx = boardCanvas.getContext('2d', { willReadFrequently: true });
    bCtx.drawImage(
      currentImage,
      bounds.realXmin, bounds.realYmin, bounds.realXmax - bounds.realXmin, bounds.realYmax - bounds.realYmin,
      0, 0, 256, 256
    );

    const recognized = await runTileInferenceOnBoardCanvas(boardCanvas, false);
    if (recognized) {
      showToast('✨ Posición reconocida al instante con IA', 2500);
    } else {
      hideLoading();
      showToast('⚠️ No se reconoció el tablero con claridad. Ajusta las esquinas.', 4000);
      showScreen('crop');
      requestAnimationFrame(() => {
        renderCanvas();
        renderPerspectiveGrid();
      });
    }
  } catch (err) {
    console.error('Error in processImageDirectlyToResult:', err);
    hideLoading();
    showToast('⚠️ Imagen no reconocida. Ajusta el encuadre manualmente.', 3500);
    showScreen('crop');
    requestAnimationFrame(() => {
      renderCanvas();
      renderPerspectiveGrid();
    });
  } finally {
    hideLoading();
  }
}

async function runTileInferenceOnBoardCanvas(boardCanvas, isManual = false, warpedYoloInfo = null) {
  const session = await getInferenceSession();

  // 1. Extract Grayscale [0, 1] for 256x256
  const bCtx = boardCanvas.getContext('2d', { willReadFrequently: true });
  const imgData = bCtx.getImageData(0, 0, 256, 256);
  const boardGray = new Float32Array(256 * 256);
  for (let i = 0; i < boardGray.length; i++) {
    const idx = i * 4;
    boardGray[i] = (0.299 * imgData.data[idx] + 0.587 * imgData.data[idx + 1] + 0.114 * imgData.data[idx + 2]) / 255.0;
  }

  // 2. Slice into 64 tiles (32x32)
  const tilesInput = new Float32Array(64 * TILE_PX * TILE_PX);
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const tileIdx = rank * 8 + file;
      const tileOffset = tileIdx * (TILE_PX * TILE_PX);
      const startY = rank * TILE_PX;
      const startX = file * TILE_PX;

      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          tilesInput[tileOffset + y * TILE_PX + x] = boardGray[(startY + y) * 256 + (startX + x)];
        }
      }
    }
  }

  // 3. Run ONNX Tile Inference with tensor memory disposal
  const inputTensor = new ort.Tensor('float32', tilesInput, [64, TILE_PX * TILE_PX]);
  let results = null;
  let probs = null;
  try {
    results = await session.run({ tiles: inputTensor });
    probs = new Float32Array(results.probs.data);
  } finally {
    inputTensor.dispose?.();
    results?.probs?.dispose?.();
  }

  // 4. Parse tile classifications
  const tileGrid = [];
  const tileConf = [];
  let pieceCount = 0;
  for (let i = 0; i < 64; i++) {
    let maxProb = -1;
    let maxClass = 0;
    for (let c = 0; c < 13; c++) {
      const p = probs[i * 13 + c];
      if (p > maxProb) {
        maxProb = p;
        maxClass = c;
      }
    }
    const char = LABELS[maxClass];
    if (char !== '1') pieceCount++;
    tileGrid.push(char === '1' ? null : char);
    tileConf.push(maxProb);
  }

  // 5. Hybrid Ensemble with YOLO26n if warpedYoloInfo is provided (Manual Crop mode)
  let recognizedGrid = tileGrid;
  let rankOneDet = null;
  let boardBox = null;
  let lmEnds = [];
  let yoloPieces = [];

  if (warpedYoloInfo && warpedYoloInfo.canvas) {
    const yoloRes = await runYolo26OnSource(warpedYoloInfo.canvas, warpedYoloInfo.canvas.width, warpedYoloInfo.canvas.height);
    if (yoloRes && yoloRes.pieces.length >= 1) {
      rankOneDet = yoloRes.rankOneDet;
      boardBox = yoloRes.boardBox;
      lmEnds = yoloRes.lmEnds;
      yoloPieces = yoloRes.pieces;

      const { marginPx, innerSz } = warpedYoloInfo;
      const yoloGrid = Array(64).fill(null);
      const yoloConf = Array(64).fill(0);

      for (const p of yoloRes.pieces) {
        const u = (p.cx - marginPx) / innerSz;
        const v = (p.cy - marginPx) / innerSz;
        if (u >= -0.05 && u <= 1.05 && v >= -0.05 && v <= 1.05) {
          const col = Math.min(7, Math.max(0, Math.floor(u * 8)));
          const row = Math.min(7, Math.max(0, Math.floor(v * 8)));
          const idx = row * 8 + col;
          if (p.conf > yoloConf[idx]) {
            yoloGrid[idx] = p.name;
            yoloConf[idx] = p.conf;
          }
        }
      }

      // Combine YOLO26n + Tile CNN ensemble
      const ensembleGrid = Array(64).fill(null);
      pieceCount = 0;
      for (let i = 0; i < 64; i++) {
        if (yoloGrid[i]) {
          // If YOLO is weak (<0.32) and Tile CNN is very confident (>0.85) on a different piece, trust Tile CNN
          if (yoloConf[i] < 0.32 && tileGrid[i] && tileConf[i] > 0.85) {
            ensembleGrid[i] = tileGrid[i];
          } else {
            ensembleGrid[i] = yoloGrid[i];
          }
        } else if (tileGrid[i] && tileConf[i] >= 0.72) {
          ensembleGrid[i] = tileGrid[i];
        }
        if (ensembleGrid[i]) pieceCount++;
      }
      recognizedGrid = ensembleGrid;
    }
  }

  // In auto mode, if virtually no pieces were recognized, treat as unverified
  if (!isManual && pieceCount < 2) {
    return false;
  }

  // 6. Check orientation (180° flip if necessary) & turn
  const { isFlipped, turn } = detectOrientationAndTurn(
    recognizedGrid,
    rankOneDet,
    boardBox,
    lmEnds,
    yoloPieces
  );
  currentSquares = isFlipped ? [...recognizedGrid].reverse() : recognizedGrid;
  isBoardViewFlipped = isFlipped;
  activeColor = turn;
  syncTurnButtonsUI();

  // 7. Update UI & History
  renderBoard();
  updateFenDisplay();
  saveToHistory(getFenString());
  showScreen('result');
  return true;
}

/**
 * -------------------------------------------------------------
 * MANUAL RE-ANALYSIS FROM CROP SCREEN
 * -------------------------------------------------------------
 */
btnProcessScan?.addEventListener('click', async () => {
  if (!currentImage) return;

  try {
    showLoading('Re-analizando con el nuevo encuadre...');

    const rect = cropViewport.getBoundingClientRect();
    const w = rect.width || 400;
    const h = rect.height || 400;

    const p0 = { x: (gridCorners.tl.x / 100) * w, y: (gridCorners.tl.y / 100) * h };
    const p1 = { x: (gridCorners.tr.x / 100) * w, y: (gridCorners.tr.y / 100) * h };
    const p2 = { x: (gridCorners.br.x / 100) * w, y: (gridCorners.br.y / 100) * h };
    const p3 = { x: (gridCorners.bl.x / 100) * w, y: (gridCorners.bl.y / 100) * h };

    const H = getHomographyFromUnitSquare(p0, p1, p2, p3);
    if (!H) throw new Error('Las 4 esquinas no forman una cuadrícula válida.');

    const boardCanvas = extractWarpedBoard(cropCanvas, H);
    const warpedYoloInfo = extractWarpedBoardWithMargin(cropCanvas, H, 640, 32);

    await runTileInferenceOnBoardCanvas(boardCanvas, true, warpedYoloInfo);
    showToast('✨ Posición actualizada con el nuevo encuadre', 2500);
  } catch (err) {
    console.error('Classification error:', err);
    alert('Error al clasificar el tablero: ' + err.message);
  } finally {
    hideLoading();
  }
});

/**
 * -------------------------------------------------------------
 * CHESSBOARD RENDERING & INTERACTIVE EDITING
 * -------------------------------------------------------------
 */
const PIECE_NAMES = {
  P: 'wP', N: 'wN', B: 'wB', R: 'wR', Q: 'wQ', K: 'wK',
  p: 'bP', n: 'bN', b: 'bB', r: 'bR', q: 'bQ', k: 'bK',
};

function renderBoard() {
  const { invalidSquares, inCheckSquare } = validateCurrentPosition();

  if (viewSideLabel) {
    viewSideLabel.textContent = isBoardViewFlipped ? 'Negras' : 'Blancas';
  }

  chessboard.innerHTML = '';
  for (let vRank = 0; vRank < 8; vRank++) {
    for (let vFile = 0; vFile < 8; vFile++) {
      const rank = isBoardViewFlipped ? 7 - vRank : vRank;
      const file = isBoardViewFlipped ? 7 - vFile : vFile;
      const idx = rank * 8 + file;
      const isLight = (rank + file) % 2 === 0;
      const squareEl = document.createElement('div');

      let classes = `square ${isLight ? 'light' : 'dark'}`;
      if (idx === inCheckSquare) classes += ' in-check';
      if (invalidSquares && invalidSquares.has(idx)) classes += ' invalid-piece';

      squareEl.className = classes;
      squareEl.dataset.index = idx;

      // Algebraic rank label on left column
      if (vFile === 0) {
        const rankSpan = document.createElement('span');
        rankSpan.className = 'coord-rank';
        rankSpan.textContent = String(8 - rank);
        squareEl.appendChild(rankSpan);
      }

      // Algebraic file label on bottom row
      if (vRank === 7) {
        const fileSpan = document.createElement('span');
        fileSpan.className = 'coord-file';
        fileSpan.textContent = String.fromCharCode('a'.charCodeAt(0) + file);
        squareEl.appendChild(fileSpan);
      }

      const piece = currentSquares[idx];
      if (piece && PIECE_NAMES[piece]) {
        const img = document.createElement('img');
        img.src = `pieces/${PIECE_NAMES[piece]}.svg`;
        img.alt = piece;
        squareEl.appendChild(img);
      }

      squareEl.addEventListener('click', () => openPiecePicker(idx));
      chessboard.appendChild(squareEl);
    }
  }
}

btnFlipView?.addEventListener('click', () => {
  isBoardViewFlipped = !isBoardViewFlipped;
  renderBoard();
  showToast(
    isBoardViewFlipped ? '🔄 Vista desde el lado de Negras' : '🔄 Vista desde el lado de Blancas',
    1800
  );
});

btnInvertBoard?.addEventListener('click', () => {
  currentSquares.reverse();
  isBoardViewFlipped = !isBoardViewFlipped;
  renderBoard();
  updateFenDisplay();
  saveToHistory(getFenString());
  showToast('↕️ Filas del tablero invertidas (180°)', 2000);
});

/**
 * -------------------------------------------------------------
 * CHESS POSITION RULES & FEN VALIDATOR (chess.js + semantic rules)
 * -------------------------------------------------------------
 */
function validateCurrentPosition() {
  const squares = currentSquares;
  const errors = [];
  const warnings = [];
  const invalidSquares = new Set();
  let inCheckSquare = null;

  // 1. King counts and positions
  const whiteKings = [];
  const blackKings = [];
  let whitePawns = 0, blackPawns = 0;
  let whitePieces = 0, blackPieces = 0;
  let whiteQueens = 0, blackQueens = 0;
  let whiteRooks = 0, blackRooks = 0;
  let whiteBishops = 0, blackBishops = 0;
  let whiteKnights = 0, blackKnights = 0;

  for (let i = 0; i < 64; i++) {
    const p = squares[i];
    if (!p) continue;
    const row = Math.floor(i / 8);

    if (p === 'K') { whiteKings.push(i); whitePieces++; }
    else if (p === 'k') { blackKings.push(i); blackPieces++; }
    else if (p === 'P') {
      whitePawns++; whitePieces++;
      if (row === 0 || row === 7) {
        errors.push('Peón blanco en fila 1 u 8 (los peones no pueden estar en los extremos)');
        invalidSquares.add(i);
      }
    }
    else if (p === 'p') {
      blackPawns++; blackPieces++;
      if (row === 0 || row === 7) {
        errors.push('Peón negro en fila 1 u 8 (los peones no pueden estar en los extremos)');
        invalidSquares.add(i);
      }
    }
    else if (p === 'Q') { whiteQueens++; whitePieces++; }
    else if (p === 'q') { blackQueens++; blackPieces++; }
    else if (p === 'R') { whiteRooks++; whitePieces++; }
    else if (p === 'r') { blackRooks++; blackPieces++; }
    else if (p === 'B') { whiteBishops++; whitePieces++; }
    else if (p === 'b') { blackBishops++; blackPieces++; }
    else if (p === 'N') { whiteKnights++; whitePieces++; }
    else if (p === 'n') { blackKnights++; blackPieces++; }
  }

  // King rules
  if (whiteKings.length === 0) {
    errors.push('Falta el Rey Blanco (♔). <div class="validator-tip">👉 Toca una casilla vacía para colocarlo.</div>');
  } else if (whiteKings.length > 1) {
    errors.push(`Hay ${whiteKings.length} Reyes Blancos (solo debe haber 1)`);
    whiteKings.forEach((idx) => invalidSquares.add(idx));
  }

  if (blackKings.length === 0) {
    errors.push('Falta el Rey Negro (♚). <div class="validator-tip">👉 Toca una casilla vacía para colocarlo.</div>');
  } else if (blackKings.length > 1) {
    errors.push(`Hay ${blackKings.length} Reyes Negros (solo debe haber 1)`);
    blackKings.forEach((idx) => invalidSquares.add(idx));
  }

  // Adjacent kings (kings touching)
  if (whiteKings.length === 1 && blackKings.length === 1) {
    const wr = Math.floor(whiteKings[0] / 8), wc = whiteKings[0] % 8;
    const br = Math.floor(blackKings[0] / 8), bc = blackKings[0] % 8;
    if (Math.abs(wr - br) <= 1 && Math.abs(wc - bc) <= 1) {
      errors.push('Los dos reyes están juntos en casillas contiguas (distancia ilegal)');
      invalidSquares.add(whiteKings[0]);
      invalidSquares.add(blackKings[0]);
    }
  }

  // Pawns limit
  if (whitePawns > 8) errors.push(`Demasiados peones blancos: ${whitePawns} (máximo 8)`);
  if (blackPawns > 8) errors.push(`Demasiados peones negros: ${blackPawns} (máximo 8)`);

  // Total pieces limit
  if (whitePieces > 16) errors.push(`Demasiadas piezas blancas: ${whitePieces} (máximo 16)`);
  if (blackPieces > 16) errors.push(`Demasiadas piezas negras: ${blackPieces} (máximo 16)`);

  // Extra promoted pieces vs available pawns
  const extraWhite = Math.max(0, whiteQueens - 1) + Math.max(0, whiteRooks - 2) + Math.max(0, whiteBishops - 2) + Math.max(0, whiteKnights - 2);
  if (extraWhite > (8 - whitePawns)) {
    errors.push('Promociones imposibles: faltan peones blancos para tantas damas/torres/caballos');
  }
  const extraBlack = Math.max(0, blackQueens - 1) + Math.max(0, blackRooks - 2) + Math.max(0, blackBishops - 2) + Math.max(0, blackKnights - 2);
  if (extraBlack > (8 - blackPawns)) {
    errors.push('Promociones imposibles: faltan peones negros para tantas damas/torres/caballos');
  }

  let statusText = 'Posición Legal';
  let statusType = 'valid';
  let icon = '🟢';

  // Rule verification with chess.js if structural checks pass
  if (errors.length === 0) {
    const currentFen = getFenString();
    const oppColor = activeColor === 'w' ? 'b' : 'w';
    let fenRows = [];
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      let rowStr = '';
      for (let c = 0; c < 8; c++) {
        const p = squares[r * 8 + c];
        if (!p) empty++;
        else {
          if (empty > 0) { rowStr += empty; empty = 0; }
          rowStr += p;
        }
      }
      if (empty > 0) rowStr += empty;
      fenRows.push(rowStr);
    }
    const oppFen = `${fenRows.join('/')} ${oppColor} - - 0 1`;

    try {
      const chessActive = new Chess(currentFen);
      const chessOpp = new Chess(oppFen);

      const activeInCheck = chessActive.inCheck();
      const oppInCheck = chessOpp.inCheck();

      if (activeInCheck && oppInCheck) {
        errors.push('Ambos reyes están en jaque simultáneamente (posición físicamente imposible)');
        invalidSquares.add(whiteKings[0]);
        invalidSquares.add(blackKings[0]);
      } else if (oppInCheck) {
        errors.push(`El bando que no tiene el turno (${oppColor === 'w' ? 'Blancas' : 'Negras'}) está en jaque. <div class="validator-tip">👉 Cambia el turno de juego a ${oppColor === 'w' ? 'Blancas' : 'Negras'}.</div>`);
        inCheckSquare = oppColor === 'w' ? whiteKings[0] : blackKings[0];
      } else if (activeInCheck) {
        inCheckSquare = activeColor === 'w' ? whiteKings[0] : blackKings[0];

        if (chessActive.isCheckmate()) {
          warnings.push(`¡Jaque Mate! El rey ${activeColor === 'w' ? 'blanco' : 'negro'} no tiene jugadas legales.`);
          statusType = 'info';
          icon = '🏆';
          statusText = 'Jaque Mate';
        } else {
          warnings.push(`¡Jaque! Le toca jugar a ${activeColor === 'w' ? 'Blancas' : 'Negras'} y su rey está bajo ataque.`);
          statusType = 'warning';
          icon = '⚠️';
          statusText = 'En Jaque';
        }
      } else if (chessActive.isStalemate()) {
        warnings.push('¡Rey Ahogado! El bando con el turno no tiene movimientos legales pero no está en jaque (Tablas).');
        statusType = 'info';
        icon = '🤝';
        statusText = 'Rey Ahogado (Tablas)';
      }
    } catch (err) {
      console.warn('chess.js validation note:', err);
    }
  }

  if (errors.length > 0) {
    statusType = 'error';
    icon = '🔴';
    statusText = 'Posición Ilegal';
  }

  // Update UI Card
  if (positionValidatorCard) {
    positionValidatorCard.className = `validator-card ${statusType}`;
    if (validatorBadgeIcon) validatorBadgeIcon.textContent = icon;
    if (validatorStatusTitle) validatorStatusTitle.textContent = statusText;

    if (validatorDetails) {
      if (errors.length > 0 || warnings.length > 0) {
        validatorDetails.classList.remove('hidden');
        let html = '<ul>';
        errors.forEach((e) => { html += `<li>${e}</li>`; });
        warnings.forEach((w) => { html += `<li>${w}</li>`; });
        html += '</ul>';
        validatorDetails.innerHTML = html;
      } else {
        validatorDetails.classList.add('hidden');
        validatorDetails.innerHTML = '';
      }
    }
  }

  return { isValid: errors.length === 0, invalidSquares, inCheckSquare };
}

function openPiecePicker(index) {
  selectedSquareIndex = index;
  const rank = 8 - Math.floor(index / 8);
  const file = String.fromCharCode('a'.charCodeAt(0) + (index % 8));
  modalSquareLabel.textContent = `Casilla: ${file}${rank}`;
  pieceModal.classList.remove('hidden');
}

pieceModal.querySelectorAll('.piece-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const piece = btn.dataset.piece;
    if (selectedSquareIndex >= 0) {
      currentSquares[selectedSquareIndex] = piece;
      renderBoard();
      updateFenDisplay();
      pieceModal.classList.add('hidden');
    }
  });
});

btnClearSquare.addEventListener('click', () => {
  if (selectedSquareIndex >= 0) {
    currentSquares[selectedSquareIndex] = null;
    renderBoard();
    updateFenDisplay();
    pieceModal.classList.add('hidden');
  }
});

btnCancelModal.addEventListener('click', () => {
  pieceModal.classList.add('hidden');
});

/**
 * -------------------------------------------------------------
 * FEN GENERATION & EXPORT
 * -------------------------------------------------------------
 */
function getFenString() {
  let fen = '';
  for (let rank = 0; rank < 8; rank++) {
    let emptyCount = 0;
    for (let file = 0; file < 8; file++) {
      const piece = currentSquares[rank * 8 + file];
      if (!piece) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          fen += emptyCount;
          emptyCount = 0;
        }
        fen += piece;
      }
    }
    if (emptyCount > 0) fen += emptyCount;
    if (rank < 7) fen += '/';
  }

  fen += ` ${activeColor} - - 0 1`;
  return fen;
}

function updateFenDisplay() {
  fenText.textContent = getFenString();
  validateCurrentPosition();
}

btnCopyFen.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(getFenString());
    btnCopyFen.textContent = '✅ ¡Copiado!';
    setTimeout(() => {
      btnCopyFen.textContent = '📋 Copiar FEN';
    }, 2000);
  } catch (err) {
    alert('FEN: ' + getFenString());
  }
});

btnOpenChesscom.addEventListener('click', () => {
  const fen = encodeURIComponent(getFenString());
  window.open(`https://www.chess.com/analysis?fen=${fen}`, '_blank', 'noopener,noreferrer');
});

btnShareFen.addEventListener('click', async () => {
  const fen = getFenString();
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Posición de Ajedrez (Img2FEN)',
        text: fen,
      });
    } catch (_) {}
  } else {
    navigator.clipboard.writeText(fen);
    alert('FEN copiado al portapapeles: ' + fen);
  }
});

/**
 * -------------------------------------------------------------
 * LOCAL HISTORY (LocalStorage)
 * -------------------------------------------------------------
 */
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('img2fen_history') || '[]');
  } catch {
    return [];
  }
}

function saveToHistory(fen) {
  let history = getHistory().filter((f) => f !== fen);
  history.unshift(fen);
  if (history.length > 10) history = history.slice(0, 10);
  localStorage.setItem('img2fen_history', JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  historyList.innerHTML = '';
  if (history.length === 0) {
    historyList.innerHTML = '<p class="empty-state">No hay escaneos recientes todavía.</p>';
    return;
  }

  history.forEach((fen) => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const fenSpan = document.createElement('span');
    fenSpan.className = 'history-fen';
    fenSpan.textContent = fen;

    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'history-arrow';
    arrowSpan.textContent = '➡️';

    item.appendChild(fenSpan);
    item.appendChild(arrowSpan);

    item.addEventListener('click', () => {
      loadFenIntoBoard(fen);
      showScreen('result');
    });
    historyList.appendChild(item);
  });
}

function loadFenIntoBoard(fen) {
  const parts = fen.split(' ');
  const rows = parts[0].split('/');
  activeColor = parts[1] || 'w';
  isBoardViewFlipped = false;
  syncTurnButtonsUI();

  currentSquares = Array(64).fill(null);
  for (let r = 0; r < 8; r++) {
    let col = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') {
        col += parseInt(ch, 10);
      } else {
        currentSquares[r * 8 + col] = ch;
        col++;
      }
    }
  }
  renderBoard();
  updateFenDisplay();
}

/**
 * -------------------------------------------------------------
 * INPUT HANDLERS
 * -------------------------------------------------------------
 */
inputCamera.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    handleFile(e.target.files[0]);
  }
  e.target.value = '';
});

inputGallery.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    handleFile(e.target.files[0]);
  }
  e.target.value = '';
});

/**
 * -------------------------------------------------------------
 * DESKTOP DRAG & DROP AND CLIPBOARD PASTE
 * -------------------------------------------------------------
 */
const dropZone = document.getElementById('drop-zone');

if (dropZone) {
  dropZone.addEventListener('click', () => {
    inputGallery.click();
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files && files[0] && files[0].type.startsWith('image/')) {
      handleFile(files[0]);
    }
  });
}

// Window Drag & Drop support (drop anywhere on desktop)
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (files && files[0] && files[0].type.startsWith('image/')) {
    handleFile(files[0]);
  }
});

// Paste from Clipboard (Ctrl+V / Cmd+V on desktop or mobile)
window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (items) {
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          handleFile(file);
          break;
        }
      }
    }
  }
});

// Window resize handler to adapt canvas dynamically
window.addEventListener('resize', () => {
  if (screens.crop.classList.contains('active')) {
    renderCanvas();
  }
});

/**
 * -------------------------------------------------------------
 * TOAST NOTIFICATIONS
 * -------------------------------------------------------------
 */
let toastTimer = null;
function showToast(message, duration = 3000) {
  const toast = document.getElementById('app-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

/**
 * -------------------------------------------------------------
 * PWA SERVICE WORKER & AUTO-UPDATE ENGINE
 * -------------------------------------------------------------
 */
let updateServiceWorkerFn = null;
let swRegistration = null;

updateServiceWorkerFn = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] Nueva versión disponible en segundo plano.');
    // Only auto-reload if user is idle on the home screen with no image loaded
    if (!currentImage && document.getElementById('screen-home')?.classList.contains('active')) {
      showToast('⚡ Actualizando a la última versión...', 2000);
      setTimeout(() => {
        if (updateServiceWorkerFn) {
          updateServiceWorkerFn(true);
        } else {
          window.location.reload();
        }
      }, 500);
    }
  },
  onOfflineReady() {
    console.log('[PWA] Aplicación lista para funcionar offline.');
  },
  onRegisteredSW(swUrl, registration) {
    swRegistration = registration;
    console.log('[PWA] Service Worker registrado correctamente.');
    if (registration) {
      // 1. Chequeo automático al abrir la aplicación (tras 1.5s de cortesía)
      setTimeout(() => {
        if (!currentImage) {
          try {
            registration.update().catch(() => {});
          } catch (_) {}
        }
      }, 1500);

      // 2. Chequeo automático cuando la app vuelve a primer plano (solo si no hay imagen en proceso)
      window.addEventListener('focus', () => {
        if (!currentImage && document.getElementById('screen-home')?.classList.contains('active')) {
          try {
            registration.update().catch(() => {});
          } catch (_) {}
        }
      });

      // 3. Chequeo recurrente cada 15 minutos mientras esté abierta
      setInterval(() => {
        if (!currentImage) {
          try {
            registration.update().catch(() => {});
          } catch (_) {}
        }
      }, 15 * 60 * 1000);
    }
  },
  onRegisterError(error) {
    console.warn('[PWA] Error registrando el Service Worker:', error);
  }
});

// Listener de seguridad ante cambio de controlador (skipWaiting aplicado)
let refreshing = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (refreshing) return;
  // Never disrupt active user session if an image is loaded or user is not on home screen
  const isIdle = !currentImage && document.getElementById('screen-home')?.classList.contains('active');
  if (isIdle) {
    refreshing = true;
    window.location.reload();
  } else {
    console.log('[PWA] Nueva versión lista. Se mantendrá la pantalla actual sin interrumpir.');
  }
});

// Botón manual de comprobación y clic en el badge de versión
const btnCheckUpdate = document.getElementById('btn-check-update');
const appVersionBadge = document.getElementById('app-version-badge');

async function handleCheckForUpdates() {
  if (btnCheckUpdate) {
    btnCheckUpdate.classList.add('checking');
  }
  showToast('🔍 Buscando actualizaciones...');

  try {
    if (!('serviceWorker' in navigator)) {
      showToast('Este navegador no soporta Service Workers.');
      return;
    }

    const reg = swRegistration || (await navigator.serviceWorker.getRegistration());
    if (!reg) {
      showToast('Iniciando Service Worker, prueba en unos segundos...');
      return;
    }

    await reg.update();

    if (reg.waiting || reg.installing) {
      showToast('⚡ ¡Nueva versión encontrada! Actualizando...', 2500);
      if (updateServiceWorkerFn) {
        updateServiceWorkerFn(true);
      } else {
        window.location.reload();
      }
    } else {
      showToast('✅ Ya tienes la última versión (v2.5.1)', 2500);
    }
  } catch (err) {
    console.warn('[PWA] Error comprobando actualización:', err);
    showToast('Sin conexión o no se pudo comprobar.', 2500);
  } finally {
    if (btnCheckUpdate) {
      btnCheckUpdate.classList.remove('checking');
    }
  }
}

btnCheckUpdate?.addEventListener('click', handleCheckForUpdates);
appVersionBadge?.addEventListener('click', handleCheckForUpdates);

/**
 * -------------------------------------------------------------
 * PWA INSTALLATION PROMPT
 * -------------------------------------------------------------
 */
const btnInstallPwa = document.getElementById('btn-install-pwa');
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredInstallPrompt = e;
  // Update UI notify the user they can install the PWA
  if (btnInstallPwa) {
    btnInstallPwa.classList.remove('hidden');
  }
});

if (btnInstallPwa) {
  btnInstallPwa.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      deferredInstallPrompt = null;
      btnInstallPwa.classList.add('hidden');
    } else {
      // Fallback instruction for browsers where prompt isn't directly triggerable
      alert('Para instalar Img2FEN:\n\n- En Chrome / Edge: Pulsa el icono de instalar en la barra de direcciones.\n- En iOS (Safari): Pulsa el botón Compartir y elige "Añadir a pantalla de inicio".\n- En Android: Abre el menú de 3 puntos y pulsa "Instalar aplicación".');
    }
  });
}

window.addEventListener('appinstalled', () => {
  console.log('Img2FEN installed successfully!');
  if (btnInstallPwa) {
    btnInstallPwa.classList.add('hidden');
  }
});

/**
 * -------------------------------------------------------------
 * WEB SHARE TARGET HANDLER (Incoming images shared from other apps)
 * -------------------------------------------------------------
 */
async function checkSharedImage() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('shared') === '1') {
    try {
      const cache = await caches.open('img2fen-shared-data');
      const response = await cache.match('shared-image');
      if (response) {
        const blob = await response.blob();
        const fileName = response.headers.get('x-file-name') || 'shared-diagram.png';
        const file = new File([blob], fileName, { type: blob.type || 'image/png' });
        await cache.delete('shared-image');

        // Clean up URL without reloading
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        showToast('📷 Imagen compartida recibida. Analizando...', 2500);
        handleFile(file);
        return;
      }
    } catch (err) {
      console.warn('[PWA] Error recuperando imagen compartida:', err);
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Initial history load
renderHistory();
checkSharedImage();
