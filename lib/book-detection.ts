import type { BookBounds } from './book-recognition-types';

export const MAX_BOOK_CROPS = 20;

/** Overlapping zoomed passes recover small covers, including gaps in the middle.
 * At most four extra inferences; unlike an uncovered-edge search this also works
 * when the overview finds nothing. Keep the overview to retain large covers.
 */
export function chooseBookSearchTiles(
  width: number,
  height: number,
): BookBounds[] {
  if (!(width > 0 && height > 0)) return [];
  if (width / height >= 1.3)
    return [0, 0.25, 0.5].map((x) => ({ x, y: 0, width: 0.5, height: 1 }));
  if (height / width >= 1.3)
    return [0, 0.25, 0.5].map((y) => ({ x: 0, y, width: 1, height: 0.5 }));
  return [0, 0.32].flatMap((y) =>
    [0, 0.32].map((x) => ({ x, y, width: 0.68, height: 0.68 })),
  );
}

/** Ignore fragments cut by an interior tile boundary. An overlapping pass or
 * the overview sees the complete cover; the outside edges of the photo are OK.
 */
export function isCompleteTileDetection(box: BookBounds, tile: BookBounds) {
  const margin = 0.015;
  return !(
    (tile.x > 0 && box.x < margin) ||
    (tile.y > 0 && box.y < margin) ||
    (tile.x + tile.width < 0.999 && box.x + box.width > 1 - margin) ||
    (tile.y + tile.height < 0.999 && box.y + box.height > 1 - margin)
  );
}

/** Favor complete overview boxes over nearly identical zoomed boxes. Do not
 * collapse adjacent books or a genuinely small cover contained in a large box.
 */
export function mergeBookBounds(bounds: BookBounds[]): BookBounds[] {
  const accepted: BookBounds[] = [];
  for (const box of bounds) {
    if (
      accepted.some((other) => {
        const overlap = intersectionArea(box, other);
        const smaller = Math.min(
          box.width * box.height,
          other.width * other.height,
        );
        const larger = Math.max(
          box.width * box.height,
          other.width * other.height,
        );
        return (
          intersectionOverUnion(box, other) > 0.5 ||
          (overlap / smaller > 0.85 && smaller / larger > 0.55)
        );
      })
    )
      continue;
    accepted.push(box);
    if (accepted.length === MAX_BOOK_CROPS) break;
  }
  return accepted.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function mapBookTileBounds(
  bounds: BookBounds[],
  tile: BookBounds,
): BookBounds[] {
  return bounds.map((box) => ({
    x: tile.x + box.x * tile.width,
    y: tile.y + box.y * tile.height,
    width: box.width * tile.width,
    height: box.height * tile.height,
  }));
}

/** Clamp detector pixel coordinates; reject tiny, invalid and duplicate boxes. */
export function filterBookBounds(
  predictions: { class: string; score: number; bbox: number[] }[],
  width: number,
  height: number,
): BookBounds[] {
  if (!(width > 0 && height > 0)) return [];
  const accepted: BookBounds[] = [];
  for (const prediction of [...predictions].sort((a, b) => b.score - a.score)) {
    const [x, y, w, h] = prediction.bbox;
    if (
      prediction.class !== 'book' ||
      !Number.isFinite(prediction.score) ||
      prediction.score < 0.4 ||
      ![x, y, w, h].every(Number.isFinite) ||
      w <= 0 ||
      h <= 0
    )
      continue;
    const left = Math.max(0, x),
      top = Math.max(0, y);
    const right = Math.min(width, x + w),
      bottom = Math.min(height, y + h);
    const box = {
      x: left / width,
      y: top / height,
      width: (right - left) / width,
      height: (bottom - top) / height,
    };
    if (
      box.width < 0.035 ||
      box.height < 0.035 ||
      box.width * box.height < 0.003
    )
      continue;
    if (accepted.some((other) => intersectionOverUnion(box, other) > 0.65))
      continue;
    accepted.push(box);
    if (accepted.length === MAX_BOOK_CROPS) break;
  }
  return accepted.sort((a, b) => a.y - b.y || a.x - b.x);
}

function intersectionArea(a: BookBounds, b: BookBounds) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}

function intersectionOverUnion(a: BookBounds, b: BookBounds) {
  const overlap = intersectionArea(a, b);
  return overlap / (a.width * a.height + b.width * b.height - overlap);
}

export function withRecognitionTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label}: tempo limite excedido`)),
      milliseconds,
    );
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
