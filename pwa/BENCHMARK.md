# Comparativa de reconocimiento: Img2FEN v2.7.0 vs v3.0.0

Ambas versiones se ejecutaron en Chromium sin interfaz, cargando la imagen igual que lo haría un usuario (botón «Abrir imagen»), y se comparó el FEN resultante con la solución.

## 1. Tus imágenes de prueba (`posiciones01.pdf`)

| Imagen | v2.7.0 | v3.0.0 |
|---|---|---|
| Diagrama de libro (casillas rayadas) | 63/64 – alfil blanco de c8 leído como negro | 63/64 – mismo fallo (ahora la casilla se marca en amarillo como dudosa) |
| Foto de un móvil girado ~35° con perspectiva | ❌ no encuentra el tablero (pide encuadre manual) | ✅ 64/64 |
| Foto de pantalla, tablero visto desde negras | ✅ 64/64 | ✅ 64/64 |

## 2. Banco de pruebas generado (120 imágenes con solución conocida)

Posiciones sacadas de partidas simuladas (no usadas al ajustar el motor). 30 imágenes por tipo, con estilos de piezas distintos (Cburnett y fuentes tipográficas de diagrama), 9 temas de color, coordenadas, resaltado de última jugada y un 30 % de tableros vistos desde negras. Las «fotos» tienen giro de hasta ±35°, perspectiva, desenfoque, ruido, moiré y luz desigual.

| Tipo | v2.7.0: posiciones exactas | v3.0.0: posiciones exactas | v2.7.0: casillas correctas | v3.0.0: casillas correctas |
|---|---|---|---|---|
| Capturas de pantalla | 19/30 | **21/30** | 95,9 % | **97,8 %** |
| Fotos de pantalla | 0/30 | **22/30** | 69,4 % | **97,1 %** |
| Diagramas de libro escaneados | 6/30 | **13/30** | 89,5 % | **97,8 %** |
| Fotos de libro | 0/30 | **10/30** | 67,1 % | **93,5 %** |
| **Total** | **25/120** | **66/120** | **80,5 %** | **96,6 %** |

Tiempo medio por imagen en el navegador de prueba (2 núcleos, sin GPU): ~2,2 s.

## Lo que sigue fallando

- **Fuentes de diagrama poco habituales**: la mayoría de los errores restantes son alfiles o caballos leídos como peones con tipografías que el modelo de casillas no vio al entrenarse. Arreglarlo de verdad requiere reentrenar ese modelo con más estilos.
- **Color de piezas en libros** con trazo muy grueso (el alfil de tu diagrama).
- **Tableros físicos (piezas 3D)**: los tres modelos ONNX están entrenados con diagramas 2D. La nueva geometría encuentra bien la cuadrícula de un tablero real, pero las piezas en 3D requieren un modelo distinto entrenado con fotos reales. No había fotos de tableros físicos en las pruebas, así que esta versión no promete mejora ahí.
- **Orientación** cuando no hay marcador «1» visible: se decide comparando la posición con dónde suelen estar las piezas en partidas reales, así que en posiciones raras (problemas compuestos) puede salir girada; el botón «Invertir 180°» lo corrige.
