import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findIsolatedCoverBounds,
  combineCoverBounds,
} from '../lib/book-contours.ts';
import { mergeBookBounds } from '../lib/book-detection.ts';

function image(
  width: number,
  height: number,
  foreground: (x: number, y: number) => boolean,
  textured = false,
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const color = foreground(x, y) ? 35 : textured && (x + y) % 2 ? 90 : 200;
      data.set([color, color, color, 255], (y * width + x) * 4);
    }
  return data;
}
void test('plain-background contours retain four and five separate rectangular covers', () => {
  for (const count of [4, 5]) {
    const data = image(
      600,
      300,
      (x, y) =>
        y >= 50 &&
        y < 250 &&
        x >= 20 &&
        Math.floor((x - 20) / 115) < count &&
        (x - 20) % 115 < 90,
    );
    const boxes = findIsolatedCoverBounds(data, 600, 300);
    assert.equal(boxes.length, count);
    assert.ok(boxes.every((box) => box.width > 0.145 && box.width < 0.16));
  }
});
void test('contours abstain on texture, blank photos, isolated objects, thin strips and circles', () => {
  assert.deepEqual(
    findIsolatedCoverBounds(
      image(200, 200, () => false),
      200,
      200,
    ),
    [],
  );
  assert.deepEqual(
    findIsolatedCoverBounds(
      image(200, 200, (x, y) => x > 50 && x < 150 && y > 50 && y < 150),
      200,
      200,
    ),
    [],
  );
  const rectangles = (x: number, y: number) =>
    y > 30 && y < 170 && ((x > 20 && x < 80) || (x > 120 && x < 180));
  assert.deepEqual(
    findIsolatedCoverBounds(image(200, 200, rectangles, true), 200, 200),
    [],
  );
  const circles = (x: number, y: number) =>
    (x - 50) ** 2 + (y - 100) ** 2 < 40 ** 2 ||
    (x - 150) ** 2 + (y - 100) ** 2 < 40 ** 2;
  assert.deepEqual(
    findIsolatedCoverBounds(image(200, 200, circles), 200, 200),
    [],
  );
  assert.deepEqual(
    findIsolatedCoverBounds(
      image(
        200,
        200,
        (x, y) =>
          ((x > 20 && x < 24) || (x > 120 && x < 124)) && y > 30 && y < 170,
      ),
      200,
      200,
    ),
    [],
  );
});
void test('geometric combination removes title fragments and group boxes but retains separate model detections', () => {
  const outlines = [
    { x: 0.1, y: 0.1, width: 0.2, height: 0.6 },
    { x: 0.4, y: 0.1, width: 0.2, height: 0.6 },
  ];
  const extra = { x: 0.75, y: 0.1, width: 0.15, height: 0.6 };
  const boxes = combineCoverBounds(outlines, [
    { x: 0.12, y: 0.2, width: 0.1, height: 0.1 },
    { x: 0.08, y: 0.08, width: 0.55, height: 0.65 },
    extra,
  ]);
  assert.deepEqual(boxes, [...outlines, extra]);
  assert.equal(
    mergeBookBounds(
      combineCoverBounds(
        Array.from({ length: 20 }, (_, i) => ({
          x: i,
          y: 0,
          width: 0.5,
          height: 0.5,
        })),
        [{ x: 30, y: 0, width: 0.5, height: 0.5 }],
      ),
    ).length,
    20,
  );
});

void test('a joined contour cannot erase two separate model-detected covers', () => {
  const books = [
    { x: 0.1, y: 0.1, width: 0.2, height: 0.6 },
    { x: 0.32, y: 0.1, width: 0.2, height: 0.6 },
  ];
  assert.deepEqual(
    combineCoverBounds(
      [{ x: 0.09, y: 0.09, width: 0.45, height: 0.63 }],
      books,
    ),
    books,
  );
});
