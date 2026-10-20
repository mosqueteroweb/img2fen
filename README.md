# Img2FEN ♟️

**Conversor de diagramas e imágenes a posiciones FEN de ajedrez para Android.**

Img2FEN es una aplicación Android nativa (Kotlin + Jetpack Compose) que permite capturar fotografías con la cámara o seleccionar imágenes de la galería con diagramas de ajedrez (de libros, revistas, pantallas de Chess.com/Lichess o problemas impresos) y convertirlos al instante a formato **FEN (Forsyth–Edwards Notation)** utilizando un modelo neuronal local de alta precisión con **ONNX Runtime**, funcionando de forma **100% offline, segura y privada** (sin permisos de internet).

---

## 🚀 Características Principales

- **📸 Captura Rápida, Galería y Compartir**:
  - Haz una foto directamente con la cámara del dispositivo o importa una captura de pantalla desde la galería.
  - **Integración con "Compartir con..." de Android**: comparte capturas de ajedrez directamente desde Twitter/X, WhatsApp, navegadores o apps externas hacia Img2FEN.
  - Auto-detección algorítmica de cuadrícula de tablero y centrado automático con botón de varita mágica.
  - Guía visual interactiva de encuadre, rotación táctil con dos dedos (con indicador de ángulo efímero) y rotación rápida de 90°.

- **🧠 Reconocimiento 100% Local (Offline)**:
  - Modelo embebido `chess-tiles-v2.onnx` ejecutado mediante **Microsoft ONNX Runtime**, clasificando las 64 casillas en milisegundos con alta precisión.
  - Sin necesidad de conexión a internet, servidores externos ni claves API (código 100% air-gapped).
  - Respeto absoluto por la privacidad: tus fotos nunca salen de tu teléfono.

- **⏱️ Selector de Turno Previo**:
  - Elige de forma destacada si **Juegan Blancas (`w`)** o **Juegan Negras (`b`)** antes de generar la notación final, adaptándose a cualquier indicador del libro o diagrama.

- **🎯 Tablero Táctil Interactivo**:
  - Previsualización gráfica de la posición reconocida sobre un tablero de ajedrez estilizado.
  - Si un diagrama de imprenta antigua presenta trazos atípicos, toca cualquier casilla para cambiar la pieza o vaciarla al instante mediante el selector emergente.

- **📜 Historial de los Últimos FENs**:
  - Guarda automáticamente una lista de los últimos diagramas analizados.
  - Copia o reabre cualquier posición anterior con un solo toque desde la pantalla principal.

- **🔗 Exportación Inmediata**:
  - **Copiar FEN**: Un toque para copiar al portapapeles.
  - **Chess.com**: Botón directo para abrir en el analizador de Chess.com.
  - **Compartir**: Menú nativo para enviar a cualquier otra app de ajedrez (DroidFish, Lichess, ChessBase, etc.).

---

## 🛠️ Stack Tecnológico

- **Lenguaje**: Kotlin 2.x
- **UI**: Jetpack Compose + Material 3 (Material You)
- **Motor ML**: Microsoft ONNX Runtime Android (`com.microsoft.onnxruntime:onnxruntime-android:1.19.2`)
- **Manejo de Imágenes**: Android Graphics API + Coil
- **Arquitectura**: Arquitectura modular con StateFlow, Coroutines y separación clara por capas (model, data, engine, ui).

---

## 📦 Compilación y Generación del APK

### Requisitos
- JDK 17 o 21
- Android SDK (API 34 o 36)

```bash
# Ejecutar tests unitarios
./gradlew testDebugUnitTest

# Compilar APK de depuración
./gradlew assembleDebug
```

El APK generado se ubica en:
`app/build/outputs/apk/debug/app-debug.apk`

---

## 📄 Licencia y Atribuciones

- **Licencia Principal**: Este proyecto está publicado bajo la licencia **GNU General Public License v3.0 (GPLv3)**. Consulta el archivo [LICENSE](LICENSE) para más detalles.
- **Atribuciones de Terceros**: El modelo de reconocimiento de casillas (`chess-tiles-v2.onnx`), el motor ONNX Runtime y los activos vectoriales de ajedrez están incluidos bajo licencias compatibles (**MIT License** y **CC BY-SA 3.0**). Consulta el archivo [ATTRIBUTION.md](ATTRIBUTION.md) para los avisos y créditos legales completos.
