// Web Worker: ejecuta el reconocimiento fuera del hilo de la interfaz (la pantalla no se congela).
import { recognize } from './recognizer.js';

self.onmessage = async (e) => {
  const { id, bitmap, options } = e.data;
  try {
    if (typeof OffscreenCanvas === 'undefined') throw new Error('NO_OFFSCREEN');
    const r = await recognize(bitmap, {
      ...options,
      onProgress: (text) => self.postMessage({ id, progress: text }),
    });
    bitmap.close?.();
    if (r) delete r.debugRect;
    self.postMessage({ id, result: r });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
self.postMessage({ ready: true });
