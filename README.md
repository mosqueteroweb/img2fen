# Img2FEN ♟️

**Conversor de diagramas e imágenes a posiciones FEN de ajedrez para Android.**

Img2FEN es una aplicación Android nativa (Kotlin + Jetpack Compose) que permite capturar fotografías con la cámara o seleccionar imágenes de la galería con diagramas de ajedrez (de libros, revistas, pantallas o problemas impresos) y convertirlos al instante a formato **FEN (Forsyth–Edwards Notation)** utilizando un modelo de Machine Learning local (**TensorFlow Lite**), funcionando de forma **100% offline y privada**.

---

## 🚀 Características Principales

- **📸 Captura Rápida y Galería**:
  - Haz una foto directamente con la cámara del dispositivo o importa una captura de pantalla desde la galería.
  - Guía visual interactiva de encuadre y recorte de la cuadrícula $8 \times 8$.
  - Botón de rotación rápida de imagen (0°, 90°, 180°, 270°).

- **🧠 Reconocimiento 100% Local (Offline)**:
  - Modelo embebido `chess-piece-recognizer.tflite` que clasifica las 64 casillas en milisegundos.
  - Sin necesidad de conexión a internet, servidores externos ni claves API.
  - Respeto por la privacidad: tus fotos nunca salen de tu teléfono.

- **⏱️ Selector de Turno Previo**:
  - Elige de forma destacada si **Juegan Blancas (`w`)** o **Juegan Negras (`b`)** antes de generar la notación final, adaptándose a cualquier indicador del libro o diagrama.

- **🎯 Tablero Táctil Interactivo**:
  - Previsualización gráfica de la posición reconocida sobre un tablero de ajedrez estilizado.
  - Si un diagrama de imprenta antigua presenta trazos atípicos, toca cualquier casilla para cambiar la pieza o vaciarla en un segundo mediante el selector emergente.

- **📜 Historial de los Últimos 10 FENs**:
  - Guarda automáticamente una lista de los 10 últimos diagramas analizados.
  - Copia o reabre cualquier posición anterior con un solo toque desde la pantalla principal.

- **🔗 Exportación Inmediata**:
  - **Copiar FEN**: Un toque para copiar al portapapeles.
  - **Lichess**: Botón directo para abrir la posición en el analizador de Lichess (`https://lichess.org/analysis/...`).
  - **Chess.com**: Botón directo para abrir en el analizador de Chess.com.
  - **Compartir**: Menú nativo para enviar a cualquier otra app de ajedrez (DroidFish, ChessBase, etc.).

---

## 🛠️ Stack Tecnológico

- **Lenguaje**: Kotlin 2.x
- **UI**: Jetpack Compose + Material 3
- **Motor ML**: TensorFlow Lite + Google ML Kit Custom Image Labeling
- **Manejo de Imágenes**: Coil + Android Graphics API
- **Arquitectura**: Arquitectura moderna con StateFlow, Coroutines y separación clara por capas (model, data, engine, ui).

---

## 📦 Compilación y Generación del APK

### Requisitos
- JDK 17 o 21
- Android SDK (API 34 o 36)

```bash
# Ejecutar tests unitarios
./gradlew test

# Compilar APKs (incluye arm64-v8a optimizado y universal)
./gradlew assembleDebug
```

Los APKs generados se ubican en:
`app/build/outputs/apk/debug/app-arm64-v8a-debug.apk`
`app/build/outputs/apk/debug/app-universal-debug.apk`

---

## 📄 Licencia

Este proyecto está bajo la licencia GNU General Public License v3.0 (GPLv3). Consulta el archivo [LICENSE](LICENSE) para más detalles.