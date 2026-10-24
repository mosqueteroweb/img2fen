# Img2FEN ♟️

**Conversor inteligente de diagramas e imágenes a posiciones FEN de ajedrez.**

[![Deploy PWA to GitHub Pages](https://github.com/mosqueteroweb/img2fen/actions/workflows/deploy-pwa.yml/badge.svg)](https://github.com/mosqueteroweb/img2fen/actions/workflows/deploy-pwa.yml)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-green.svg)](https://mosqueteroweb.github.io/img2fen/)

**Img2FEN** es una aplicación web progresiva (**PWA**) instalable en cualquier dispositivo (Android, iOS, PC, Mac, Linux) diseñada para digitalizar diagramas de ajedrez (capturas de Lichess o Chess.com, libros, revistas y fotografías) y convertirlos al instante a formato **FEN (Forsyth–Edwards Notation)** de forma **100% offline, local y privada** mediante modelos neuronales ejecutados en WebAssembly (**ONNX Runtime Web**).

👉 **Probar en vivo:** **https://mosqueteroweb.github.io/img2fen/**

🆕 **v3.1.0:** fotos **HEIC** (iPhone), reconocimiento **casi el doble de rápido** (multihilo y atajos), botones «Ver desde» y «Corregir lado», avisos de error más claros y aviso cuando la foto no contiene un tablero.
**v3.0:** nuevo motor de reconocimiento que lee fotos de pantallas y libros **giradas y en perspectiva**. Comparativas en [`pwa/BENCHMARK.md`](pwa/BENCHMARK.md).

---

## 🚀 Características Principales

### 📸 1. Captura Rápida, Galería e Integración con "Compartir" de Android
- **Cámara y Galería**: Toma una foto directa o selecciona cualquier captura desde el almacenamiento local. Admite JPG, PNG, WebP y **HEIC/HEIF** (el decodificador HEIC solo se descarga la primera vez que se usa).
- **Web Share Target (Nativo en Android)**: Comparte fotos directamente desde WhatsApp, Twitter/X, el navegador o tu galería hacia Img2FEN desde el menú *"Compartir"* de tu teléfono.
- **Localización precisa del tablero**:
  - **Retícula de esquinas en X**: detecta los cruces de casillas y ajusta una homografía, por lo que funciona con tableros **girados y en perspectiva**.
  - **Refinamiento subpíxel**: las 4 esquinas se ajustan alineando las 18 líneas de la cuadrícula y verificando el patrón de damero (U-Net y YOLO aportan candidatos).
  - **Rotación automática** (0°, 90°, 180°, 270°) hasta dejar las piezas «de pie».
- **Encuadre Manual Perspectivo**: Tiradores independientes en las 4 esquinas; el reanálisis usa la foto a resolución completa y afina las esquinas solo.

### 🧠 2. Clasificación 100% Local (Offline y Privada)
- Modelo de casillas `chess-tiles-v2.onnx` con *test-time augmentation*, **fusionado** con el detector YOLO26n sobre el tablero rectificado, todo con **ONNX Runtime WebAssembly**.
- Decodificación con reglas (un rey por bando, sin peones en 1.ª/8.ª, máx. 8 peones) y casillas dudosas marcadas en amarillo.
- Orientación (vista desde blancas o negras) por el marcador «1» y por la distribución típica de las piezas.
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
- **👁 Ver desde Blancas/Negras**: gira la vista sin cambiar la posición. **⚠️ Corregir lado**: si la IA puso las blancas donde van las negras, gira las piezas 180° y corrige el FEN.
- Conmutador de turno de juego (Juegan Blancas ♔ / Juegan Negras ♚).
- **Copiar FEN**: Un toque para copiar al portapapeles.
- **Chess.com**: Abre la posición directamente en el tablero de análisis de Chess.com.
- **Historial Local**: Acceso rápido a las últimas posiciones escaneadas.

---

## 🛠️ Stack Tecnológico

- **Frontend**: HTML5 Semántico, CSS3 Moderno (Glassmorphism, CSS Grid, animaciones fluidas), JavaScript ES Modules.
- **PWA**: ficheros estáticos sin compilación + service worker propio (offline completo y Web Share Target).
- **Motor de Inferencia ML**: [Microsoft ONNX Runtime Web](https://www.npmjs.com/package/onnxruntime-web) (WASM SIMD, hasta 4 hilos: el service worker activa el aislamiento de origen que GitHub Pages no permite configurar).
- **HEIC/HEIF**: [`libheif-js`](https://github.com/catdad-experiments/libheif-js) (LGPL-3.0), cargado bajo demanda.
- **Reglas y Validación**: [`chess.js`](https://github.com/jhlywa/chess.js) (BSD-2-Clause) + Validador semántico in-house.
- **Despliegue Continuo**: GitHub Actions + GitHub Pages.

---

## 💻 Desarrollo Local

```bash
git clone https://github.com/mosqueteroweb/img2fen.git
cd img2fen/pwa
python3 -m http.server 8080   # abre http://localhost:8080
```

No hay paso de compilación: GitHub Actions publica la carpeta `pwa/` tal cual en GitHub Pages.

---

## 📄 Licencia y Atribuciones

- **Licencia Principal**: Este proyecto está publicado bajo la licencia **GNU General Public License v3.0 (GPLv3)**. Consulta el archivo [LICENSE](LICENSE) para más detalles.
- **Atribuciones de Terceros**: Consulta [ATTRIBUTION.md](ATTRIBUTION.md) para ver los créditos y licencias de los modelos ONNX (`fenshot`, `yamero999`), piezas vectoriales de ajedrez (Cburnett) y bibliotecas de código abierto (`chess.js`, `onnxruntime-web`).
