import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterBookBounds,
  chooseBookSearchTile,
  mapBookTileBounds,
  suggestBookTitle,
  withRecognitionTimeout,
} from '../lib/book-detection.ts';
import { createBookRecognitionQueue } from '../lib/book-recognition.ts';

void test('detector clips bounds and filters non-books, low confidence, tiny and duplicate regions', () => {
  assert.deepEqual(
    filterBookBounds(
      [
        { class: 'book', score: 0.95, bbox: [-10, -20, 60, 120] },
        { class: 'book', score: 0.9, bbox: [-10, -20, 60, 120] },
        { class: 'person', score: 1, bbox: [0, 0, 100, 100] },
        { class: 'book', score: 0.1, bbox: [0, 0, 100, 100] },
        { class: 'book', score: 0.9, bbox: [50, 50, 1, 1] },
        { class: 'book', score: 0.9, bbox: [NaN, 0, 100, 100] },
        { class: 'book', score: 0.9, bbox: [200, 200, 100, 100] },
      ],
      100,
      100,
    ),
    [{ x: 0, y: 0, width: 0.5, height: 1 }],
  );
  assert.deepEqual(filterBookBounds([], 0, 100), []);
});

void test('suggestions preserve Portuguese, reject noise and low confidence', () => {
  assert.equal(
    suggestBookTitle('1234\nISBN 123456\n  A invenção de Hugo Cabret ', 80),
    'A invenção de Hugo Cabret',
  );
  assert.equal(suggestBookTitle('Uma história', 20), null);
  assert.equal(suggestBookTitle('Uma história', NaN), null);
  assert.equal(suggestBookTitle('$$$\n123456\nwww.editora.com', 90), null);
});

void test('timeouts resolve, reject and do not hide original errors', async () => {
  assert.equal(
    await withRecognitionTimeout(Promise.resolve(42), 100, 'teste'),
    42,
  );
  await assert.rejects(
    withRecognitionTimeout(Promise.reject(new Error('original')), 100, 'teste'),
    /original/,
  );
  await assert.rejects(
    withRecognitionTimeout(new Promise(() => {}), 5, 'teste'),
    /tempo limite/,
  );
});

void test('queue applies backpressure, dispatches serially, cancels and ignores stale worker messages', async () => {
  const oldWorker = globalThis.Worker;
  const workers: FakeWorker[] = [];
  class FakeWorker {
    onmessage: ((message: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    sent: unknown[] = [];
    terminated = false;
    constructor() {
      workers.push(this);
    }
    postMessage(data: unknown) {
      this.sent.push(data);
    }
    terminate() {
      this.terminated = true;
    }
  }
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: FakeWorker,
  });
  try {
    const done: string[] = [];
    const titles: string[] = [];
    const queue = createBookRecognitionQueue(
      {
        onCrops: () => {},
        onTitle: (event) => titles.push(event.status),
        onDone: (event) => done.push(`${event.photoId}:${event.status}`),
      },
      { maxPending: 2, workerFactory: () => new Worker('mock') },
    );
    assert.equal(queue.enqueue(new Blob(), 'one'), true);
    assert.equal(queue.enqueue(new Blob(), 'two'), true);
    assert.equal(queue.enqueue(new Blob(), 'three'), false);
    assert.equal(workers[0].sent.length, 1);
    workers[0].onmessage?.({
      data: { type: 'crops', photoId: 'one', crops: [{ id: 'one:crop:0' }] },
    });
    queue.cancel('one');
    assert.equal(workers[0].terminated, true);
    assert.equal(workers[0].onmessage, null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(workers.length, 2);
    assert.deepEqual(titles, ['error']);
    workers[1].onmessage?.({
      data: { type: 'done', photoId: 'two', status: 'complete' },
    });
    assert.deepEqual(done, ['one:cancelled', 'two:complete']);
    queue.dispose();
    assert.equal(queue.enqueue(new Blob(), 'four'), false);
  } finally {
    globalThis.Worker = oldWorker;
  }
});

void test('queue deadline terminates hung worker and settles OCR-only job', async () => {
  const oldWorker = globalThis.Worker;
  let terminated = false;
  class FakeWorker {
    onmessage = null;
    onerror = null;
    onmessageerror = null;
    postMessage() {}
    terminate() {
      terminated = true;
    }
  }
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: FakeWorker,
  });
  try {
    const titles: string[] = [];
    const done: string[] = [];
    const queue = createBookRecognitionQueue(
      {
        onCrops: () => assert.fail('OCR-only must not emit crops'),
        onTitle: (event) => titles.push(event.cropId),
        onDone: (event) => done.push(event.status),
      },
      { timeoutMs: 5, workerFactory: () => new Worker('mock') },
    );
    assert.equal(
      queue.enqueueCrop(new Blob(), { photoId: 'one', cropId: 'edited' }),
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(terminated, true);
    assert.deepEqual(titles, ['edited']);
    assert.deepEqual(done, ['error']);
    queue.dispose();
  } finally {
    globalThis.Worker = oldWorker;
  }
});

void test('detector retains ten or more distinct covers and caps at twenty', () => {
  const predictions = Array.from({ length: 25 }, (_, index) => ({
    class: 'book',
    score: 0.9,
    bbox: [(index % 5) * 200, Math.floor(index / 5) * 200, 150, 180],
  }));
  assert.equal(
    filterBookBounds(predictions.slice(0, 10), 1000, 1000).length,
    10,
  );
  assert.equal(filterBookBounds(predictions, 1000, 1000).length, 20);
});

function ocrLine(words: [string, number][], y: number, height = 30) {
  return {
    text: words.map(([text]) => text).join(' '),
    confidence: 80,
    bbox: { x0: 0, y0: y, x1: 300, y1: y + height },
    words: words.map(([text, confidence], index) => ({
      text,
      confidence,
      bbox: { x0: index * 100, y0: y, x1: index * 100 + 90, y1: y + height },
    })),
  };
}
void test('geometric OCR joins nearby title lines and ignores small author and low-confidence decoration', () => {
  const blocks = [
    {
      paragraphs: [
        {
          lines: [
            ocrLine(
              [
                ['DP', 20],
                ['Simgo', 40],
              ],
              0,
              80,
            ),
            ocrLine(
              [
                ['O', 95],
                ['MENINO', 95],
              ],
              100,
              55,
            ),
            ocrLine([['MALUQUINHO', 77]], 160, 60),
            ocrLine(
              [
                ['Nome', 96],
                ['Autor', 95],
              ],
              250,
              15,
            ),
          ],
        },
      ],
    },
  ];
  assert.equal(suggestBookTitle('ignored', 40, blocks), 'O MENINO MALUQUINHO');
});
void test('geometric OCR rejects weak interior words instead of inventing missing title text', () => {
  const blocks = [
    {
      paragraphs: [
        {
          lines: [
            ocrLine(
              [
                ['EM', 36],
                ['MENINA', 93],
                ['BONITA', 65],
              ],
              100,
              55,
            ),
            ocrLine(
              [
                ['do', 95],
                ['ECO', 35],
                ['de', 94],
                ['Fifa', 77],
              ],
              160,
              60,
            ),
          ],
        },
      ],
    },
  ];
  assert.equal(suggestBookTitle('ignored', 49, blocks), 'MENINA BONITA');
  assert.equal(suggestBookTitle('DP Simgo', 60), null);
  assert.equal(suggestBookTitle('Nome do autor\nTítulo do livro', 95), null);
  assert.equal(suggestBookTitle('DP Simgo', 95, []), null);
});

void test('second detector pass searches substantial uncovered side and maps back to original', () => {
  const tile = chooseBookSearchTile([
    { x: 0.11, y: 0.07, width: 0.32, height: 0.8 },
  ]);
  assert.ok(tile);
  assert.ok(Math.abs(tile.x - 0.39) < 0.0001);
  assert.equal(tile.height, 1);
  const mapped = mapBookTileBounds(
    [{ x: 0.2, y: 0.1, width: 0.5, height: 0.8 }],
    tile,
  );
  assert.ok(Math.abs(mapped[0].x - 0.512) < 0.0001);
  assert.ok(Math.abs(mapped[0].width - 0.305) < 0.0001);
  assert.equal(chooseBookSearchTile([]), null);
  assert.equal(
    chooseBookSearchTile([{ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }]),
    null,
  );
});
