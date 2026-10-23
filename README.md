# Img2FEN ♟️

**Conversor inteligente de diagramas e imágenes a posiciones FEN de ajedrez.**

[![Deploy PWA to GitHub Pages](https://github.com/mosqueteroweb/img2fen/actions/workflows/deploy-pwa.yml/badge.svg)](https://github.com/mosqueteroweb/img2fen/actions/workflows/deploy-pwa.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-green.svg)](https://mosqueteroweb.github.io/img2fen/)

**Img2FEN** es una aplicación web progresiva (**PWA**) instalable en cualquier dispositivo (Android, iOS, PC, Mac, Linux) diseñada para digitalizar diagramas de ajedrez (capturas de Lichess o Chess.com, libros, revistas y fotografías) y convertirlos al instante a formato **FEN (Forsyth–Edwards Notation)** de forma **100% offline, local y privada** mediante modelos neuronales ejecutados en WebAssembly (**ONNX Runtime Web**).

👉 **Probar en vivo:** **https://mosqueteroweb.github.io/img2fen/**

🧪 **Nueva versión Pro (reconocimiento mejorado, fotos giradas y en perspectiva):** **https://mosqueteroweb.github.io/img2fen/pro/** — código en [`pwa/public/pro`](pwa/public/pro), comparativa en [`BENCHMARK.md`](pwa/public/pro/BENCHMARK.md).

---

## 🚀 Características Principales

### 📸 1. Captura Rápida, Galería e Integración con "Compartir" de Android
- **Cámara y Galería**: Toma una foto directa o selecciona cualquier captura desde el almacenamiento local.
- **Web Share Target (Nativo en Android)**: Comparte fotos directamente desde WhatsApp, Twitter/X, el navegador o tu galería hacia Img2FEN desde el menú *"Compartir"* de tu teléfono.
- **Recorte Inteligente Híbrido**:
  - **Detector Periódico y Bimodal de Tableros**: Detecta instantáneamente (< 5ms) la cuadrícula 8×8 y los dos colores dominantes del tablero, descartando barras de evaluación, encabezados y relojes con precisión al píxel.
  - **Respaldo con IA (U-Net)**: Segmentación neuronal para fotografías de tableros físicos en ángulo o perspectiva.
- **Encuadre Manual Perspectivo**: Tiradores independientes en las 4 esquinas con lupa de aumento para ajustes milimétricos.

### 🧠 2. Clasificación 100% Local (Offline y Privada)
- Modelo convolucional de clasificación de casillas `chess-tiles-v2.onnx` ejecutado mediante **ONNX Runtime WebAssembly**.
- Sin servidores externos ni APIs: tus fotos nunca salen de tu dispositivo y funciona sin internet.

### 🛡️ 3. Chequeador de Posiciones FEN y Reglas FIDE en Tiempo Real
- **Validación Estructural**:
  - Detección de reyes ausentes, duplicados o contiguos (tocándose).
  - Control de peones en filas extremas (1 u 8).
  - Límite de piezas (máx. 16 por bando) y coherencia matemática de coronaciones.
- **Reglas Dinámicas de Partida (`chess.js`)**:
  - Alerta de jaque ilegal si el bando sin el turno está bajo ataque.
  - Resaltado visual en el tablero del rey bajo ataque (animación roja pulsante).
  - Identificación automática de **Jaque**, **Jaque Mate** (🏆) y **Rey Ahogado / Tablas** (🤝).

### 🎯 4. Edición Táctil y Exportación
- Modifica o añade cualquier pieza tocando sobre la casilla.
- Conmutador de turno de juego (Juegan Blancas ♔ / Juegan Negras ♚).
- **Copiar FEN**: Un toque para copiar al portapapeles.
- **Chess.com**: Abre la posición directamente en el tablero de análisis de Chess.com.
- **Historial Local**: Acceso rápido a las últimas posiciones escaneadas.

---

## 🛠️ Stack Tecnológico

- **Frontend**: HTML5 Semántico, CSS3 Moderno (Glassmorphism, CSS Grid, animaciones fluidas), JavaScript ES Modules.
- **Bundler / PWA Engine**: [Vite](https://vitejs.dev/) + [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) (Workbox).
- **Motor de Inferencia ML**: [Microsoft ONNX Runtime Web](https://www.npmjs.com/package/onnxruntime-web) (WASM SIMD multihilo).
- **Reglas y Validación**: [`chess.js`](https://github.com/jhlywa/chess.js) (BSD-2-Clause) + Validador semántico in-house.
- **Despliegue Continuo**: GitHub Actions + GitHub Pages.

---

## 💻 Desarrollo Local

```bash
# 1. Clonar el repositorio
git clone https://github.com/mosqueteroweb/img2fen.git
cd img2fen/pwa

# 2. Instalar dependencias
npm install

# 3. Iniciar servidor de desarrollo
npm run dev

# 4. Compilar para producción
npm run build
```

---

## 📄 Licencia y Atribuciones

- **Licencia Principal**: Este proyecto está publicado bajo la licencia **GNU General Public License v3.0 (GPLv3)**. Consulta el archivo [LICENSE](LICENSE) para más detalles.
- **Atribuciones de Terceros**: Consulta [ATTRIBUTION.md](ATTRIBUTION.md) para ver los créditos y licencias de los modelos ONNX (`fenshot`, `yamero999`), piezas vectoriales de ajedrez (Cburnett) y bibliotecas de código abierto (`chess.js`, `onnxruntime-web`).
