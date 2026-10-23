# Img2FEN Pro ♟️

Alternativa a la PWA original de **Img2FEN**, con las mismas funciones (cámara, galería, «Compartir» de Android, arrastrar/pegar, encuadre manual de 4 esquinas, editor de piezas, validador FIDE, turno, copiar/compartir FEN, abrir en Chess.com, historial, funcionamiento 100 % offline e instalable). Cambia el **motor de reconocimiento**.

## Qué cambia en el reconocimiento

| Paso | Original | Pro |
|---|---|---|
| Localizar el tablero | Caja alineada con los ejes (YOLO / proyección de gradientes / U‑Net) y un trapecio aproximado | Detección de la **retícula de esquinas en X** (puntos silla) + homografía, también U‑Net y YOLO como candidatos; después **refinamiento subpíxel** de las 4 esquinas alineando las 18 líneas de la cuadrícula y comprobación del damero. Funciona con tableros **girados y en perspectiva**. |
| Rotación | Solo 0° / 180° | Prueba **0°, 90°, 180°, 270°** y elige la que deja las piezas «de pie» |
| Piezas | Un modelo u otro según el modo | CNN de casillas con **test‑time augmentation** (7 encuadres ligeramente desplazados) **fusionada** con YOLO sobre el tablero rectificado |
| Reglas | Solo avisa | Las usa al decidir: un rey por bando, sin peones en 1.ª/8.ª, máx. 8 peones |
| Vista blancas/negras | Marcador «1» de YOLO o media de los peones | Marcador «1» de YOLO buscado en el tablero rectificado y en la imagen completa; si no aparece, compara **todas** las piezas (peones, reyes y resto) con dónde suelen estar en partidas reales |
| Encuadre manual | Se recortaba la imagen del visor (≈400 px) | Se usan las esquinas sobre la **imagen original a resolución completa** y se refinan solas |
| Casillas dudosas | — | Se marcan en **amarillo** para revisarlas |

Los modelos ONNX son los mismos de la versión original (`chess-tiles-v2`, `chess-yolo26n`, `board-segmentation`); la mejora está en la geometría y en cómo se combinan.

## Resultados medidos

Ver `BENCHMARK.md`.

## Ejecutar en local

No necesita compilación: son ficheros estáticos.

```bash
cd pwa-pro
python3 -m http.server 8080
# abre http://localhost:8080
```

## Publicar

Basta con servir la carpeta tal cual (GitHub Pages, Netlify, etc.). Por ejemplo, copiándola dentro de `pwa/public/pro/` del repositorio, el flujo actual de GitHub Actions la publicará en `https://mosqueteroweb.github.io/img2fen/pro/` (si haces esto, excluye `pro/**` de `globPatterns` en `vite.config.js` para que el service worker de la versión original no la precachee también).

## Estructura

```
index.html, style.css, main.js   Interfaz (basada en la original)
js/recognizer.js                 Orquestación del reconocimiento y modelos ONNX
js/detector.js                   Retícula de esquinas, refinamiento, puntuación del damero
js/geometry.js                   Homografías y cuadriláteros
js/imageops.js                   Desenfoque, gradientes, rectificación
js/vendor/                       onnxruntime-web 1.21 (MIT) y chess.js (BSD-2)
model/ wasm/ pieces/ icons/      Recursos (ver ATTRIBUTION.md del proyecto)
sw.js, manifest.webmanifest      PWA offline + Web Share Target
```

Licencia: GPLv3, como el proyecto original. Créditos de modelos y piezas en `ATTRIBUTION.md`.
