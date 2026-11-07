/// <reference types="vite/client" />
// Vite's worker entry wrapper uses a same-origin URL even when RSC rewrites
// import.meta.url in client-reference modules to a synthetic file URL.
// oxlint-disable-next-line import/default -- Vite generates this default export.
import RecognitionWorker from '../workers/book-recognition.worker.ts?worker';

export function createRecognitionWorker(): Worker {
  return new RecognitionWorker();
}
