/// <reference lib="webworker" />
import {
  filterBookBounds,
  chooseBookSearchTiles,
  isCompleteTileDetection,
  mergeBookBounds,
  mapBookTileBounds,
  MAX_BOOK_CROPS,
  withRecognitionTimeout,
} from '../lib/book-detection';
import {
  findIsolatedCoverBounds,
  combineCoverBounds,
} from '../lib/book-contours';
import type {
  BookBounds,
  BookCrop,
  RecognitionEvent,
} from '../lib/book-recognition-types';
import type { ObjectDetection } from '@tensorflow-models/coco-ssd';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const emit = (event: RecognitionEvent) => scope.postMessage(event);
let detector: Promise<ObjectDetection> | null = null;
let detectorUnavailable = false;

// Only public, versioned detector assets are cached. Image blobs never enter fetch.
const originalFetch = scope.fetch.bind(scope);
scope.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (
    !url.startsWith(
      'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/',
    ) ||
    (init?.method ?? 'GET') !== 'GET'
  )
    return originalFetch(input, init);
  let cache: Cache | null = null;
  try {
    cache = await caches.open('estante-book-detector-v1');
  } catch {
    /* Private mode may deny storage. */
  }
  const hit = await cache?.match(url);
  if (hit) return hit;
  const response = await originalFetch(input, init);
  if (response.ok) {
    try {
      await cache?.put(url, response.clone());
    } catch {
      /* Storage is best effort. */
    }
  }
  return response;
};

async function getDetector() {
  if (!detector)
    detector = (async () => {
      // CPU backend works inside workers without GPU contexts and leaves UI thread free.
      const tf = await import('@tensorflow/tfjs');
      await tf.setBackend('cpu');
      await tf.ready();
      const coco = await import('@tensorflow-models/coco-ssd');
      return coco.load({ base: 'lite_mobilenet_v2' });
    })();
  return detector;
}

function canvasFor(bitmap: ImageBitmap, bounds: BookBounds, maxSide: number) {
  const sx = Math.max(0, Math.round(bounds.x * bitmap.width));
  const sy = Math.max(0, Math.round(bounds.y * bitmap.height));
  const sw = Math.max(
    1,
    Math.min(bitmap.width - sx, Math.round(bounds.width * bitmap.width)),
  );
  const sh = Math.max(
    1,
    Math.min(bitmap.height - sy, Math.round(bounds.height * bitmap.height)),
  );
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(sw * scale)),
    Math.max(1, Math.round(sh * scale)),
  );
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponível');
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function recognize(file: Blob, photoId: string) {
  let bitmap: ImageBitmap | null = null;
  try {
    if (file.size > 30 * 1024 * 1024) throw new Error('Imagem muito grande');
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (bitmap.width * bitmap.height > 50_000_000)
      throw new Error('Imagem muito grande');
    const fullBounds = { x: 0, y: 0, width: 1, height: 1 };
    let bounds: BookBounds[] = [];
    if (!detectorUnavailable) {
      try {
        const model = await withRecognitionTimeout(
          getDetector(),
          45_000,
          'Preparação do detector',
        );
        const tf = await import('@tensorflow/tfjs');
        const detectTile = async (tile: BookBounds) => {
          const canvas = canvasFor(bitmap!, tile, 640);
          const context = canvas.getContext('2d')!;
          // fromPixels(ImageData) does not depend on a DOM canvas in the worker.
          const tensor = tf.browser.fromPixels(
            context.getImageData(0, 0, canvas.width, canvas.height),
          );
          try {
            const predictions = await withRecognitionTimeout(
              model.detect(tensor, MAX_BOOK_CROPS, 0.4),
              20_000,
              'Detecção de capas',
            );
            return mapBookTileBounds(
              filterBookBounds(predictions, canvas.width, canvas.height).filter(
                (box) => isCompleteTileDetection(box, tile),
              ),
              tile,
            );
          } finally {
            tensor.dispose();
          }
        };
        bounds = await detectTile(fullBounds);
        // Bound CPU work on phones. Each pass is serial and optional; preserve
        // all previous results if the next inference fails or times out.
        const searchStarted = performance.now();
        for (const searchTile of chooseBookSearchTiles(
          bitmap.width,
          bitmap.height,
        )) {
          if (bounds.length >= MAX_BOOK_CROPS) break;
          if (performance.now() - searchStarted >= 25_000) {
            emit({
              type: 'warning',
              photoId,
              message:
                'A busca ampliada atingiu o limite de tempo. Confira as áreas marcadas e adicione capas que faltaram.',
            });
            break;
          }
          try {
            const extra = await detectTile(searchTile);
            bounds = mergeBookBounds([...bounds, ...extra]);
          } catch {
            emit({
              type: 'warning',
              photoId,
              message:
                'Algumas capas podem não ter sido separadas. Confira a foto original na revisão.',
            });
            break;
          }
        }
      } catch {
        detectorUnavailable = true;
        emit({
          type: 'warning',
          photoId,
          message:
            'O modelo de reconhecimento não ficou disponível. Revise as áreas sugeridas ou marque as capas manualmente.',
        });
      }
    }
    // Complement the generic model only on plain backgrounds with separated,
    // rectangular covers. All pixels stay in this worker.
    const outlineCanvas = canvasFor(bitmap, fullBounds, 640);
    const outlinePixels = outlineCanvas
      .getContext('2d')!
      .getImageData(0, 0, outlineCanvas.width, outlineCanvas.height);
    const outlines = findIsolatedCoverBounds(
      outlinePixels.data,
      outlineCanvas.width,
      outlineCanvas.height,
    );
    if (outlines.length)
      emit({
        type: 'warning',
        photoId,
        message:
          'Áreas sugeridas pelas bordas da foto. Confira os recortes e ajuste qualquer capa incompleta.',
      });
    bounds = mergeBookBounds(combineCoverBounds(outlines, bounds));
    const source = bounds.length ? 'detector' : 'whole-photo';
    if (!bounds.length) bounds = [fullBounds];
    const crops: BookCrop[] = [];
    for (const [index, bound] of bounds.entries()) {
      const canvas = canvasFor(bitmap, bound, 1600);
      crops.push({
        id: `${photoId}:crop:${index}`,
        bounds: bound,
        blob: await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 }),
      });
    }
    emit({
      type: 'crops',
      photoId,
      crops,
      source,
      dimensions: { width: bitmap.width, height: bitmap.height },
    });
    bitmap.close();
    bitmap = null;
  } catch {
    emit({
      type: 'warning',
      photoId,
      message:
        'Não foi possível processar esta foto no aparelho. Mantenha a foto original e preencha o título manualmente.',
    });
    emit({ type: 'done', photoId, status: 'error' });
    return;
  } finally {
    bitmap?.close();
  }
  emit({ type: 'done', photoId, status: 'complete' });
}

scope.onmessage = ({
  data,
}: MessageEvent<{
  file: Blob;
  photoId: string;
}>) => {
  // The main-thread queue dispatches only after this worker emits done.
  void recognize(data.file, data.photoId);
};
