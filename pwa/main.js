import { Chess } from './js/vendor/chess.js';
import { recognize, preloadModels } from './js/recognizer.js';

const APP_VERSION = '3.0.0';

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

// Engine Mode Selection: 'auto' | 'books' | 'screens'
let currentEngineMode = 'auto';
const engineAuto = document.getElementById('engine-auto');
const engineBooks = document.getElementById('engine-books');
const engineScreens = document.getElementById('engine-screens');

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

function setEngineMode(mode) {
  currentEngineMode = mode;
  [engineAuto, engineBooks, engineScreens].forEach((btn) => {
    if (btn) btn.classList.remove('active');
  });
  if (mode === 'books' && engineBooks) engineBooks.classList.add('active');
  else if (mode === 'screens' && engineScreens) engineScreens.classList.add('active');
  else if (engineAuto) engineAuto.classList.add('active');

  const names = {
    auto: '🤖 Modo Auto (Híbrido Inteligente)',
    books: '📖 Modo Libros y Diagramas (Fenshot)',
    screens: '💻 Modo Pantallas y Fotos (YOLO26)',
  };
  showToast(names[mode] || mode, 2000);
}

engineAuto?.addEventListener('click', () => setEngineMode('auto'));
engineBooks?.addEventListener('click', () => setEngineMode('books'));
engineScreens?.addEventListener('click', () => setEngineMode('screens'));

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

btnReopenCrop?.addEventListener('click', () => openCropScreen());

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

/**
 * -------------------------------------------------------------
 * MOTOR DE RECONOCIMIENTO (js/recognizer.js)
 * -------------------------------------------------------------
 */
let lastQuad = null;              // esquinas detectadas en coordenadas de la imagen original
let uncertainSquares = new Set(); // casillas con baja confianza

function cornersFromQuad(q) {
  return {
    tl: { x: q[0][0], y: q[0][1] },
    tr: { x: q[1][0], y: q[1][1] },
    br: { x: q[2][0], y: q[2][1] },
    bl: { x: q[3][0], y: q[3][1] },
  };
}

function setCropFromQuad(q) {
  lastQuad = q;
  applyCornersToCropView(cornersFromQuad(q), true);
}

function openCropScreen() {
  showScreen('crop');
  requestAnimationFrame(() => {
    if (lastQuad) applyCornersToCropView(cornersFromQuad(lastQuad), true);
    renderCanvas();
    renderPerspectiveGrid();
  });
}

function applyRecognition(r) {
  currentSquares = r.squares.slice();
  isBoardViewFlipped = r.flipped;
  activeColor = r.turn;
  uncertainSquares = new Set();
  r.conf.forEach((c, i) => { if (c < 0.75) uncertainSquares.add(i); });
  syncTurnButtonsUI();
  renderBoard();
  updateFenDisplay();
  saveToHistory(getFenString());
  showScreen('result');
}

function progressText(t) {
  if (loadingText) loadingText.textContent = t;
}

async function processImageDirectlyToResult() {
  if (!currentImage) return;
  try {
    showLoading('Reconociendo posición con IA...');
    const r = await recognize(currentImage, { mode: currentEngineMode, onProgress: progressText });
    if (!r || r.failed) {
      hideLoading();
      lastQuad = r && r.quad ? r.quad : null;
      if (!lastQuad) {
        gridCorners = { tl: { x: 10, y: 10 }, tr: { x: 90, y: 10 }, br: { x: 90, y: 90 }, bl: { x: 10, y: 90 } };
      }
      showToast('⚠️ No encontré el tablero con claridad. Ajusta las 4 esquinas.', 4000);
      openCropScreen();
      return;
    }
    lastQuad = r.quad;
    applyRecognition(r);
    const secs = (r.ms / 1000).toFixed(1);
    showToast(r.flipped ? `✨ Posición reconocida en ${secs} s (vista desde Negras)` : `✨ Posición reconocida en ${secs} s`, 2800);
  } catch (err) {
    console.error('Error en el reconocimiento:', err);
    hideLoading();
    showToast('⚠️ Imagen no reconocida. Ajusta el encuadre manualmente.', 3500);
    openCropScreen();
  } finally {
    hideLoading();
  }
}

// Convierte un punto del visor (en %) a coordenadas de la imagen original, deshaciendo zoom, giro y desplazamiento
function viewportToImage(pt) {
  const rect = cropViewport.getBoundingClientRect();
  const w = rect.width || 400, h = rect.height || 400;
  const baseScale = Math.min(w / currentImage.width, h / currentImage.height);
  const dx = (pt.x / 100) * w - (w / 2 + offsetX);
  const dy = (pt.y / 100) * h - (h / 2 + offsetY);
  const a = (-rotation * Math.PI) / 180;
  const rx = (dx * Math.cos(a) - dy * Math.sin(a)) / scale;
  const ry = (dx * Math.sin(a) + dy * Math.cos(a)) / scale;
  return [rx / baseScale + currentImage.width / 2, ry / baseScale + currentImage.height / 2];
}

async function autoDetectChessboardWithAI(manual = false) {
  if (!currentImage) return;
  try {
    showLoading('Buscando el tablero...');
    const r = await recognize(currentImage, { mode: currentEngineMode, onProgress: progressText });
    hideLoading();
    if (!r || r.failed || !r.quad) {
      if (manual) showToast('No se detectó un tablero claro en la foto.');
      return;
    }
    setCropFromQuad(r.quad);
    renderCanvas();
    renderPerspectiveGrid();
    showToast('✨ Tablero encuadrado automáticamente', 2500);
  } catch (err) {
    hideLoading();
    console.warn('[PWA] Error en la detección automática:', err);
    if (manual) showToast('Error al analizar la imagen.');
  }
}

btnAutoDetect?.addEventListener('click', () => autoDetectChessboardWithAI(true));

btnProcessScan?.addEventListener('click', async () => {
  if (!currentImage) return;
  try {
    showLoading('Re-analizando con el nuevo encuadre...');
    const quad = [gridCorners.tl, gridCorners.tr, gridCorners.br, gridCorners.bl].map(viewportToImage);
    const r = await recognize(currentImage, { quad, mode: currentEngineMode, onProgress: progressText });
    if (!r || r.failed) throw new Error('Las 4 esquinas no forman un tablero válido.');
    lastQuad = r.quad;
    applyRecognition(r);
    showToast('✨ Posición actualizada con el nuevo encuadre', 2500);
  } catch (err) {
    console.error('Classification error:', err);
    showToast('⚠️ ' + err.message, 3500);
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

  document.getElementById('uncertain-hint')?.classList.toggle('hidden', uncertainSquares.size === 0);
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
      if (uncertainSquares.has(idx)) classes += ' uncertain';

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
  uncertainSquares = new Set([...uncertainSquares].map((i) => 63 - i));
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
      uncertainSquares.delete(selectedSquareIndex);
      renderBoard();
      updateFenDisplay();
      pieceModal.classList.add('hidden');
    }
  });
});

btnClearSquare.addEventListener('click', () => {
  if (selectedSquareIndex >= 0) {
    currentSquares[selectedSquareIndex] = null;
    uncertainSquares.delete(selectedSquareIndex);
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
    showToast('FEN: ' + getFenString(), 5000);
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
    try { await navigator.clipboard.writeText(fen); showToast('📋 FEN copiado al portapapeles', 2500); } catch (_) { showToast('FEN: ' + fen, 5000); }
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

  uncertainSquares = new Set();
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
/**
 * -------------------------------------------------------------
 * SERVICE WORKER: OFFLINE Y ACTUALIZACIONES
 * -------------------------------------------------------------
 */
let swRegistration = null;

function isIdleOnHome() {
  return !currentImage && document.getElementById('screen-home')?.classList.contains('active');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      swRegistration = await navigator.serviceWorker.register('./sw.js');
      setTimeout(() => { if (!currentImage) swRegistration.update().catch(() => {}); }, 1500);
      window.addEventListener('focus', () => { if (isIdleOnHome()) swRegistration.update().catch(() => {}); });
      setInterval(() => { if (!currentImage) swRegistration.update().catch(() => {}); }, 15 * 60 * 1000);
    } catch (err) {
      console.warn('[PWA] Error registrando el Service Worker:', err);
    }
  });
}

let refreshing = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (refreshing) return;
  if (isIdleOnHome()) {
    refreshing = true;
    window.location.reload();
  }
});

const btnCheckUpdate = document.getElementById('btn-check-update');
const appVersionBadge = document.getElementById('app-version-badge');

async function handleCheckForUpdates() {
  btnCheckUpdate?.classList.add('checking');
  showToast('🔍 Buscando actualizaciones...');
  try {
    if (!('serviceWorker' in navigator)) { showToast('Este navegador no soporta Service Workers.'); return; }
    const reg = swRegistration || (await navigator.serviceWorker.getRegistration());
    if (!reg) { showToast('Iniciando Service Worker, prueba en unos segundos...'); return; }
    await reg.update();
    if (reg.waiting || reg.installing) {
      showToast('⚡ ¡Nueva versión encontrada! Actualizando...', 2500);
      setTimeout(() => window.location.reload(), 1200);
    } else {
      showToast(`✅ Ya tienes la última versión (v${APP_VERSION})`, 2500);
    }
  } catch (err) {
    console.warn('[PWA] Error comprobando actualización:', err);
    showToast('Sin conexión o no se pudo comprobar.', 2500);
  } finally {
    btnCheckUpdate?.classList.remove('checking');
  }
}
btnCheckUpdate?.addEventListener('click', handleCheckForUpdates);
appVersionBadge?.addEventListener('click', handleCheckForUpdates);

// Precarga de los modelos en segundo plano para que el primer escaneo sea rápido
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
idle(() => preloadModels());

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
  console.log('Img2FEN instalada');
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