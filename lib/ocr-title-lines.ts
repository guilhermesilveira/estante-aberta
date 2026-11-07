import type { OCRBlock } from './book-detection.ts';
import type { OCRTitleLine } from './book-recognition-types.ts';

/** Coordinates refer to the unchanged crop, never to the original full photo. */
export function selectableTitleLines(
  blocks: OCRBlock[] | null | undefined,
  width: number,
  height: number,
): OCRTitleLine[] {
  if (!(width > 0 && height > 0 && Number.isFinite(width + height))) return [];
  return (blocks ?? [])
    .flatMap((block) =>
      block.paragraphs.flatMap((paragraph) => paragraph.lines),
    )
    .flatMap((line) => {
      const text = line.text.replace(/\s+/g, ' ').trim().slice(0, 200);
      const { x0, y0, x1, y1 } = line.bbox;
      if (!text || ![x0, y0, x1, y1].every(Number.isFinite)) return [];
      const x = Math.max(0, Math.min(1, x0 / width));
      const y = Math.max(0, Math.min(1, y0 / height));
      const right = Math.max(0, Math.min(1, x1 / width));
      const bottom = Math.max(0, Math.min(1, y1 / height));
      if (right <= x || bottom <= y) return [];
      return [{ text, bounds: { x, y, width: right - x, height: bottom - y } }];
    })
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)
    .slice(0, 64)
    .map((line, index) => ({ ...line, id: String(index) }));
}

/** Preserve photo reading order, independently of the order of taps. */
export function composeOCRTitle(
  lines: OCRTitleLine[],
  selected: string[],
): string {
  return lines
    .filter((line) => selected.includes(line.id))
    .map((line) => line.text)
    .join(' ');
}
