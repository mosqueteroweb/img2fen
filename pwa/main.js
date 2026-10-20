import * as ort from 'onnxruntime-web/wasm';
import { registerSW } from 'virtual:pwa-register';

// Configure pure WebAssembly paths using absolute document URL (not relative to bundled /assets/)
const ROOT_URL = new URL('./', window.location.href).href;
ort.env.wasm.wasmPaths = `${ROOT_URL}wasm/`;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

const MODEL_PATH = `${ROOT_URL}model/chess-tiles-v2.onnx`;
const LABELS = '1KQRBNPkqrbnp';
const TILE_PX = 32;

let sessionPromise = null;

async function getInferenceSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        const session = await ort.InferenceSession.create(MODEL_PATH, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        console.log('ONNX Model loaded successfully in PWA!');
        return session;
      } catch (err) {
        console.error('Failed to load ONNX model via WASM:', err);
        sessionPromise = null;
        throw err;
      }
    })();
  }
  return sessionPromise;
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

// Crop transform state
let scale = 1.0;
let offsetX = 0.0;
let offsetY = 0.0;
let rotation = 0.0; // in degrees
let isRotating = false;
let rotationDismissTimer = null;

// Adjustable Grid Rect (in percentages 0..100 of viewport)
let gridLeft = 0;
let gridTop = 0;
let gridRight = 100;
let gridBottom = 100;
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
const btnCornerFit = document.getElementById('btn-corner-fit');
const turnWhite = document.getElementById('turn-white');
const turnBlack = document.getElementById('turn-black');
const btnProcessScan = document.getElementById('btn-process-scan');

const cropViewport = document.getElementById('crop-viewport');
const cropCanvas = document.getElementById('crop-canvas');
const cropCtx = cropCanvas.getContext('2d');
const gridOverlay = document.getElementById('grid-overlay');
const rotationBadge = document.getElementById('rotation-badge');

const chessboard = document.getElementById('chessboard');
const fenText = document.getElementById('fen-text');
const btnCopyFen = document.getElementById('btn-copy-fen');
const btnOpenChesscom = document.getElementById('btn-open-chesscom');
const btnShareFen = document.getElementById('btn-share-fen');
const btnResultBack = document.getElementById('btn-result-back');
const btnResultNew = document.getElementById('btn-result-new');

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
  Object.keys(screens).forEach((key) => {
    screens[key].classList.toggle('active', key === name);
  });
  if (name === 'crop') {
    renderCanvas();
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
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      currentImage = img;
      resetCropState();
      showScreen('crop');
      renderCanvas();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function resetCropState() {
  scale = 1.0;
  offsetX = 0.0;
  offsetY = 0.0;
  rotation = 0.0;
  isRotating = false;
  gridLeft = 0;
  gridTop = 0;
  gridRight = 100;
  gridBottom = 100;
  updateGridOverlayStyle();
  updateRotationBadge();
}

function updateGridOverlayStyle() {
  if (!gridOverlay) return;
  gridOverlay.style.left = `${gridLeft}%`;
  gridOverlay.style.top = `${gridTop}%`;
  gridOverlay.style.width = `${gridRight - gridLeft}%`;
  gridOverlay.style.height = `${gridBottom - gridTop}%`;
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

function renderCanvas() {
  if (!currentImage) return;

  const rect = cropViewport.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

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
  const handleEl = e.target.closest('.grid-handle');
  if (handleEl) {
    activeHandle = handleEl.dataset.handle;
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
  const rect = cropViewport.getBoundingClientRect();
  const pctX = Math.min(Math.max(((clientX - rect.left) / rect.width) * 100, 0), 100);
  const pctY = Math.min(Math.max(((clientY - rect.top) / rect.height) * 100, 0), 100);
  const minSpan = 20; // minimum 20% size

  if (activeHandle === 'tl') {
    gridLeft = Math.min(pctX, gridRight - minSpan);
    gridTop = Math.min(pctY, gridBottom - minSpan);
  } else if (activeHandle === 'tr') {
    gridRight = Math.max(pctX, gridLeft + minSpan);
    gridTop = Math.min(pctY, gridBottom - minSpan);
  } else if (activeHandle === 'bl') {
    gridLeft = Math.min(pctX, gridRight - minSpan);
    gridBottom = Math.max(pctY, gridTop + minSpan);
  } else if (activeHandle === 'br') {
    gridRight = Math.max(pctX, gridLeft + minSpan);
    gridBottom = Math.max(pctY, gridTop + minSpan);
  }
  updateGridOverlayStyle();
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
    renderCanvas();
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

    renderCanvas();
  }
}, { passive: false });

cropViewport.addEventListener('touchend', (e) => {
  touchCount = e.touches.length;
  if (touchCount === 0) {
    isTouching = false;
    activeHandle = null;
  }
});

// Mouse dragging fallback for desktop
let isMouseDown = false;
let mouseStartX = 0;
let mouseStartY = 0;

cropViewport.addEventListener('mousedown', (e) => {
  const handleEl = e.target.closest('.grid-handle');
  if (handleEl) {
    activeHandle = handleEl.dataset.handle;
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
  renderCanvas();
});

window.addEventListener('mouseup', () => {
  isMouseDown = false;
  activeHandle = null;
});

cropViewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  scale = Math.min(Math.max(scale * delta, 0.5), 6.0);
  renderCanvas();
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

turnWhite.addEventListener('click', () => {
  activeColor = 'w';
  turnWhite.classList.add('active');
  turnBlack.classList.remove('active');
});

turnBlack.addEventListener('click', () => {
  activeColor = 'b';
  turnBlack.classList.add('active');
  turnWhite.classList.remove('active');
});

btnCropBack.addEventListener('click', () => showScreen('home'));
btnResultBack.addEventListener('click', () => showScreen('home'));
btnResultNew.addEventListener('click', () => showScreen('home'));

/**
 * -------------------------------------------------------------
 * QUICK-FIT GRID CONTROLS
 * -------------------------------------------------------------
 */
function guessSquareBoardBounds() {
  if (!currentImage) return;
  const rect = cropViewport.getBoundingClientRect();
  const viewportPx = rect.width;
  const baseScale = Math.min(viewportPx / currentImage.width, viewportPx / currentImage.height);
  const drawW = currentImage.width * baseScale;
  const drawH = currentImage.height * baseScale;

  // Snap adjustable grid directly onto the rendered image bounds
  const wPct = (drawW / viewportPx) * 100;
  const hPct = (drawH / viewportPx) * 100;
  gridLeft = (100 - wPct) / 2;
  gridRight = 100 - gridLeft;
  gridTop = (100 - hPct) / 2;
  gridBottom = 100 - gridTop;
  updateGridOverlayStyle();
}

// Corner click / auto-fit helper
let cornerStep = 0;
function cycleCornerOrQuickFit() {
  if (!currentImage) return;

  cornerStep = (cornerStep + 1) % 2;

  if (cornerStep === 1) {
    // Fit adjustable grid to exact image aspect ratio
    scale = 1.0;
    offsetX = 0;
    offsetY = 0;
    rotation = 0;
    guessSquareBoardBounds();
  } else {
    // Full 100% square grid
    resetCropState();
  }

  renderCanvas();
}

btnCornerFit?.addEventListener('click', cycleCornerOrQuickFit);

/**
 * -------------------------------------------------------------
 * LOCAL ONNX INFERENCE: CROP -> 256x256 -> 64 TILES (32x32)
 * -------------------------------------------------------------
 */
btnProcessScan.addEventListener('click', async () => {
  if (!currentImage) return;

  try {
    showLoading('Cargando motor de IA offline...');
    const session = await getInferenceSession();

    showLoading('Reconociendo piezas offline...');

    // 1. Render sub-region inside adjustable grid to 256x256 square canvas
    const boardCanvas = document.createElement('canvas');
    boardCanvas.width = 256;
    boardCanvas.height = 256;
    const bCtx = boardCanvas.getContext('2d');

    const rect = cropViewport.getBoundingClientRect();
    const gLeftPx = (gridLeft / 100) * rect.width;
    const gTopPx = (gridTop / 100) * rect.height;
    const gWidthPx = ((gridRight - gridLeft) / 100) * rect.width;
    const gHeightPx = ((gridBottom - gridTop) / 100) * rect.height;

    // Draw cropCanvas sub-region (matching the exact yellow grid) stretched to 256x256
    bCtx.drawImage(
      cropCanvas,
      gLeftPx, gTopPx, gWidthPx, gHeightPx,
      0, 0, 256, 256
    );

    // 2. Extract Grayscale [0, 1] for 256x256
    const imgData = bCtx.getImageData(0, 0, 256, 256);
    const boardGray = new Float32Array(256 * 256);
    for (let i = 0; i < boardGray.length; i++) {
      const idx = i * 4;
      boardGray[i] = (0.299 * imgData.data[idx] + 0.587 * imgData.data[idx + 1] + 0.114 * imgData.data[idx + 2]) / 255.0;
    }

    // 3. Slice into 64 tiles in model format: tile k = rank*8 + file
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

    // 4. Run ONNX Inference
    const inputTensor = new ort.Tensor('float32', tilesInput, [64, TILE_PX * TILE_PX]);
    const results = await session.run({ tiles: inputTensor });
    const outputTensor = results.probs;
    const probs = outputTensor.data; // Float32Array of 64 * 13

    // 5. Parse 64 classifications
    const recognizedGrid = [];
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
      recognizedGrid.push(char === '1' ? null : char);
    }

    // 6. Check board orientation (White pawns vs Black pawns)
    currentSquares = autoOrientBoard(recognizedGrid);
    sanitizeKings(currentSquares);

    // 7. Update UI & History
    renderBoard();
    updateFenDisplay();
    saveToHistory(getFenString());
    showScreen('result');
  } catch (err) {
    console.error('Classification error:', err);
    alert('Error al clasificar el tablero: ' + err.message);
  } finally {
    hideLoading();
  }
});

function autoOrientBoard(grid) {
  let whitePawnsRank1to4 = 0;
  let blackPawnsRank5to8 = 0;
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = grid[rank * 8 + file];
      if (piece === 'P' && rank < 4) whitePawnsRank1to4++;
      if (piece === 'p' && rank >= 4) blackPawnsRank5to8++;
    }
  }
  if (whitePawnsRank1to4 > 2 || blackPawnsRank5to8 > 2) {
    // Flip 180 degrees
    return [...grid].reverse();
  }
  return grid;
}

function sanitizeKings(grid) {
  let whiteKings = 0;
  let blackKings = 0;
  grid.forEach((p) => {
    if (p === 'K') whiteKings++;
    if (p === 'k') blackKings++;
  });
  if (whiteKings === 0) grid[60] = 'K'; // e1
  if (blackKings === 0) grid[4] = 'k';  // e8
}

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
  chessboard.innerHTML = '';
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const idx = rank * 8 + file;
      const isLight = (rank + file) % 2 === 0;
      const squareEl = document.createElement('div');
      squareEl.className = `square ${isLight ? 'light' : 'dark'}`;
      squareEl.dataset.index = idx;

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
  window.open(`https://www.chess.com/analysis?fen=${fen}`, '_blank');
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
});

inputGallery.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    handleFile(e.target.files[0]);
  }
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
    console.log('[PWA] Nueva versión disponible. Aplicando actualización...');
    showToast('⚡ Nueva versión encontrada. Actualizando...', 2500);
    setTimeout(() => {
      if (updateServiceWorkerFn) {
        updateServiceWorkerFn(true);
      } else {
        window.location.reload();
      }
    }, 600);
  },
  onOfflineReady() {
    console.log('[PWA] Aplicación lista para funcionar offline.');
  },
  onRegisteredSW(swUrl, registration) {
    swRegistration = registration;
    console.log('[PWA] Service Worker registrado correctamente.');
    if (registration) {
      // 1. Chequeo automático al abrir la aplicación (tras 1 segundo de cortesía)
      setTimeout(() => {
        try {
          registration.update().catch(() => {});
        } catch (_) {}
      }, 1000);

      // 2. Chequeo automático cuando la app vuelve a primer plano
      window.addEventListener('focus', () => {
        try {
          registration.update().catch(() => {});
        } catch (_) {}
      });

      // 3. Chequeo recurrente cada 15 minutos mientras esté abierta
      setInterval(() => {
        try {
          registration.update().catch(() => {});
        } catch (_) {}
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
  if (!refreshing) {
    refreshing = true;
    window.location.reload();
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
      showToast('✅ Ya tienes la última versión (v1.4.0)', 2500);
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

// Initial history load
renderHistory();
