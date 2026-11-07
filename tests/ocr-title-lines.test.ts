import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectableTitleLines,
  composeOCRTitle,
} from '../lib/ocr-title-lines.ts';
import type { OCRBlock } from '../lib/book-detection.ts';
const line = (text: string, y: number, x = 10) => ({
  text,
  confidence: 20,
  words: [],
  bbox: { x0: x, y0: y, x1: 90, y1: y + 10 },
});
void test('selectable lines preserve low-confidence OCR, normalize crop geometry and reading order', () => {
  const blocks: OCRBlock[] = [
    {
      paragraphs: [
        {
          lines: [
            line('das palavras', 60),
            line('  O  jardim\n', 30),
            line('AUTHOR', 5),
          ],
        },
      ],
    },
  ];
  const lines = selectableTitleLines(blocks, 100, 200);
  assert.deepEqual(
    lines.map((entry) => entry.text),
    ['AUTHOR', 'O jardim', 'das palavras'],
  );
  assert.deepEqual(lines[1].bounds, {
    x: 0.1,
    y: 0.15,
    width: 0.8,
    height: 0.05000000000000002,
  });
  assert.equal(composeOCRTitle(lines, ['2', '1']), 'O jardim das palavras');
  assert.equal(composeOCRTitle(lines, ['2', '2', 'missing']), 'das palavras');
  assert.equal(composeOCRTitle(lines, []), '');
});
void test('invalid and absent geometry is omitted, bounds and volume are limited', () => {
  assert.deepEqual(selectableTitleLines(null, 100, 100), []);
  const blocks = [
    {
      paragraphs: [
        {
          lines: [
            line('', 0),
            line('bad', NaN),
            line('outside', 200),
            line('1984', 0, -10),
            line('雪国', 20),
          ],
        },
      ],
    },
  ];
  assert.deepEqual(selectableTitleLines(blocks, 0, 100), []);
  const lines = selectableTitleLines(blocks, 100, 100);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].bounds.x, 0);
  assert.equal(composeOCRTitle(lines, ['0', '1']), '1984 雪国');
  assert.equal(
    selectableTitleLines(
      [
        {
          paragraphs: [
            { lines: Array.from({ length: 90 }, (_, i) => line(String(i), i)) },
          ],
        },
      ],
      100,
      200,
    ).length,
    64,
  );
});

void test('uploader keeps manual choices, rejects stale crop results and resets geometry after recropping', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../components/book-uploader.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /item\.ocrKey === cropId/);
  assert.match(source, /lines: lines \?\? item.lines/);
  assert.match(source, /key=\{draft.ocrKey\}/);
  assert.match(source, /titleEdited: true/);
  assert.match(source, /lines: undefined/);
  assert.match(
    source,
    /canApplySuggestedTitle\(item.titleEdited, item.removed\)/,
  );
});
