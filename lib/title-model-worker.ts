/// <reference types="vite/client" />
// Keep Vite's import.meta.url outside the RSC client module, as for OCR.
// oxlint-disable-next-line import/default -- Vite worker entry wrapper
import TitleWorker from '../workers/title-inference.worker.ts?worker';
export function createTitleModelWorker(): Worker {
  return new TitleWorker();
}
