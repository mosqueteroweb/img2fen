# Atribuciones y Licencias de Terceros / Third-Party Notices

Este proyecto (**Img2FEN**) está licenciado bajo la **GNU General Public License v3.0 (GPLv3)**. 
A continuación se detallan los avisos de derechos de autor, licencias y agradecimientos para los componentes de software, modelos de inteligencia artificial y recursos gráficos de terceros incorporados o utilizados en este proyecto, en cumplimiento estricto de sus términos de licencia.

---

## 1. Modelo de Reconocimiento de Ajedrez (`chess-tiles-v2.onnx`)

- **Componente**: Modelo neuronal ONNX especializado en clasificación de casillas de ajedrez digitales ($8 \times 8$).
- **Proyecto de origen**: [`fenshot`](https://github.com/scoriiu/fenshot) / kibitzo.com
- **Titular de los derechos**: Copyright (c) 2026 SORTINO LABS S.R.L. (kibitzo.com)
- **Licencia**: MIT License

```text
MIT License

Copyright (c) 2026 SORTINO LABS S.R.L. (kibitzo.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. Microsoft ONNX Runtime Web (`onnxruntime-web`)

- **Componente**: Motor de ejecución e inferencia de modelos ONNX en navegador web (WebAssembly / SIMD).
- **Proyecto de origen**: [`microsoft/onnxruntime`](https://github.com/microsoft/onnxruntime)
- **Titular de los derechos**: Copyright (c) Microsoft Corporation
- **Licencia**: MIT License

```text
MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 3. Biblioteca de Reglas y Validación de Ajedrez (`chess.js`)

- **Componente**: Motor de reglas de ajedrez, generación de movimientos, detección de jaques, jaque mate y tablas.
- **Proyecto de origen**: [`jhlywa/chess.js`](https://github.com/jhlywa/chess.js)
- **Titular de los derechos**: Copyright (c) 2026 Jeff Hlywa
- **Licencia**: BSD 2-Clause "Simplified" License

```text
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## 4. Gráficos Vectoriales de Piezas de Ajedrez

- **Componente**: Iconos vectoriales SVG de piezas de ajedrez estándar (`pieces/*.svg`).
- **Autor / Diseñador**: Colin M.L. Burnett (User:Cburnett en Wikimedia Commons).
- **Licencia**: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0) / GNU Free Documentation License (GFDL).
- **Referencia**: [Wikimedia Commons - Category:SVG chess pieces](https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces)

---

## 5. Modelo Neuronal de Segmentación de Tableros (U-Net)

- **Componente**: `board-segmentation.onnx` (U-Net Breakthrough V6).
- **Autor / Creador**: yamero999 ([Hugging Face Space](https://huggingface.co/spaces/yamero999/chess-fen-generation-api) / [Model Hub](https://huggingface.co/yamero999/ultimate-v2-chess-onnx)).
- **Licencia**: Apache License 2.0 (compatible con GNU GPLv3 según las directrices de la Free Software Foundation).
- **Descripción**: Red neuronal convolucional entrenada para segmentar y encuadrar automáticamente tableros de ajedrez en fotografías y capturas de pantalla, ejecutada localmente en el dispositivo mediante ONNX Runtime WebAssembly.
