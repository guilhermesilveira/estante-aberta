import type { BookBounds } from './book-recognition-types';

export const MAX_BOOK_CROPS = 20;

/** One extra inference on the largest unexplored strip, only when it is substantial. */
export function chooseBookSearchTile(bounds: BookBounds[]): BookBounds | null {
  if (!bounds.length || bounds.length >= MAX_BOOK_CROPS) return null;
  const left = Math.min(...bounds.map((box) => box.x));
  const top = Math.min(...bounds.map((box) => box.y));
  const right = Math.max(...bounds.map((box) => box.x + box.width));
  const bottom = Math.max(...bounds.map((box) => box.y + box.height));
  const strips = [
    { x: 0, y: 0, width: left, height: 1 },
    { x: right, y: 0, width: 1 - right, height: 1 },
    { x: 0, y: 0, width: 1, height: top },
    { x: 0, y: bottom, width: 1, height: 1 - bottom },
  ]
    .filter((box) => box.width * box.height >= 0.25)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  if (!strips.length) return null;
  const tile = strips[0];
  // A small overlap prevents a nearby book being cut exactly at the search edge.
  const x = Math.max(0, tile.x - 0.04),
    y = Math.max(0, tile.y - 0.04);
  return {
    x,
    y,
    width: Math.min(1, tile.x + tile.width + 0.04) - x,
    height: Math.min(1, tile.y + tile.height + 0.04) - y,
  };
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
      prediction.score < 0.45 ||
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

function intersectionOverUnion(a: BookBounds, b: BookBounds) {
  const overlap =
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return overlap / (a.width * a.height + b.width * b.height - overlap);
}

type OCRBox = { x0: number; y0: number; x1: number; y1: number };
type OCRWord = { text: string; confidence: number; bbox: OCRBox };
type OCRLine = {
  text: string;
  confidence: number;
  bbox: OCRBox;
  words: OCRWord[];
};
export type OCRBlock = { paragraphs: { lines: OCRLine[] }[] };

function cleanTitleText(text: string) {
  return text
    .replace(/[^\p{L}\p{N}\s:;,.'’!?&()-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function plausibleTitle(text: string) {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  return (
    letters >= 4 &&
    text.length <= 120 &&
    letters / text.length > 0.55 &&
    !/^(isbn|www\.|https?:|editora\b|edição\b|copyright\b|ilustrações\b|ilustrado\b|tradução\b|autor[a]?\b)/i.test(
      text,
    )
  );
}

/** Geometry and word confidence are evidence, not proof that a line is the title. */
export function suggestBookTitle(
  text: string,
  confidence: number,
  blocks?: OCRBlock[] | null,
): string | null {
  if (!blocks) {
    if (!Number.isFinite(confidence) || confidence < 80) return null;
    const lines = text
      .split(/\r?\n/)
      .map(cleanTitleText)
      .filter(plausibleTitle);
    // Without geometry, choosing the first of several lines may select an author.
    return lines.length === 1 ? lines[0] : null;
  }
  const lines = blocks
    .flatMap((block) =>
      block.paragraphs.flatMap((paragraph) => paragraph.lines),
    )
    .flatMap((line) => {
      const words = line.words.filter((word) => /\p{L}/u.test(word.text));
      // Isolated ornaments at the margins often become a low-confidence first/last word.
      while (words.length && words[0].confidence < 50) words.shift();
      while (words.length && words[words.length - 1].confidence < 50)
        words.pop();
      if (
        !words.length ||
        words.some(
          (word) => !Number.isFinite(word.confidence) || word.confidence < 60,
        )
      )
        return [];
      const score =
        words.reduce((sum, word) => sum + word.confidence, 0) / words.length;
      const value = cleanTitleText(words.map((word) => word.text).join(' '));
      const heights = words
        .map((word) => word.bbox.y1 - word.bbox.y0)
        .filter((height) => Number.isFinite(height) && height > 0)
        .sort((a, b) => a - b);
      if (score < 75 || !plausibleTitle(value) || !heights.length) return [];
      const height = heights[Math.floor(heights.length / 2)];
      const bbox = {
        x0: Math.min(...words.map((word) => word.bbox.x0)),
        y0: Math.min(...words.map((word) => word.bbox.y0)),
        x1: Math.max(...words.map((word) => word.bbox.x1)),
        y1: Math.max(...words.map((word) => word.bbox.y1)),
      };
      if (!Object.values(bbox).every(Number.isFinite)) return [];
      return [{ text: value, confidence: score, height, bbox }];
    })
    .sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const groups: (typeof lines)[] = [];
  for (const line of lines) {
    const group = groups[groups.length - 1];
    const previous = group?.[group.length - 1];
    const overlap = previous
      ? Math.max(
          0,
          Math.min(previous.bbox.x1, line.bbox.x1) -
            Math.max(previous.bbox.x0, line.bbox.x0),
        )
      : 0;
    const width = previous
      ? Math.min(
          previous.bbox.x1 - previous.bbox.x0,
          line.bbox.x1 - line.bbox.x0,
        )
      : 0;
    if (
      previous &&
      group.length < 4 &&
      Math.max(previous.height, line.height) /
        Math.min(previous.height, line.height) <=
        1.7 &&
      line.bbox.y0 - previous.bbox.y1 <=
        Math.max(previous.height, line.height) * 1.2 &&
      overlap / width >= 0.3
    )
      group.push(line);
    else groups.push([line]);
  }
  const ranked = groups
    .map((group) => ({
      text: group.map((line) => line.text).join(' '),
      score:
        (group.reduce((sum, line) => sum + line.height * line.confidence, 0) /
          group.length) *
        Math.sqrt(
          Math.min(
            40,
            group.reduce((sum, line) => sum + line.text.length, 0),
          ),
        ),
    }))
    .filter((group) => plausibleTitle(group.text))
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.text ?? null;
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
