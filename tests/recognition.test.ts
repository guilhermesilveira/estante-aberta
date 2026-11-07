import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterBookBounds,
  chooseBookSearchTiles,
  isCompleteTileDetection,
  mergeBookBounds,
  mapBookTileBounds,
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
        { class: 'book', score: NaN, bbox: [0, 0, 100, 100] },
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
    const queue = createBookRecognitionQueue(
      {
        onCrops: () => {},
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

void test('queue deadline terminates hung detector and settles job', async () => {
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
    const done: string[] = [];
    const queue = createBookRecognitionQueue(
      {
        onCrops: () => assert.fail('hung detector must not emit crops'),
        onDone: (event) => done.push(event.status),
      },
      { timeoutMs: 5, workerFactory: () => new Worker('mock') },
    );
    assert.equal(queue.enqueue(new Blob(), 'one'), true);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(terminated, true);
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

void test('zoomed detector searches the center and every edge even with no overview detections', () => {
  const tiles = chooseBookSearchTiles(1500, 700);
  assert.equal(tiles.length, 3);
  for (const x of [0.02, 0.22, 0.42, 0.62, 0.8])
    assert.ok(
      tiles.some((tile) => tile.x <= x && tile.x + tile.width >= x + 0.17),
    );
  assert.equal(chooseBookSearchTiles(700, 1500).length, 3);
  assert.equal(chooseBookSearchTiles(1000, 1000).length, 4);
  assert.deepEqual(chooseBookSearchTiles(0, 1000), []);
  assert.deepEqual(
    mapBookTileBounds([{ x: 0.2, y: 0.1, width: 0.5, height: 0.8 }], tiles[1]),
    [{ x: 0.35, y: 0.1, width: 0.25, height: 0.8 }],
  );
});

void test('tile boundaries reject cut fragments but allow original photo edges', () => {
  const middle = chooseBookSearchTiles(1500, 700)[1];
  assert.equal(
    isCompleteTileDetection({ x: 0, y: 0.2, width: 0.4, height: 0.6 }, middle),
    false,
  );
  assert.equal(
    isCompleteTileDetection(
      { x: 0.6, y: 0.2, width: 0.4, height: 0.6 },
      middle,
    ),
    false,
  );
  assert.equal(
    isCompleteTileDetection({ x: 0.2, y: 0, width: 0.4, height: 1 }, middle),
    true,
  );
  assert.equal(
    isCompleteTileDetection(
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: 1, height: 1 },
    ),
    true,
  );
});

void test('multiscale merge retains five neighboring covers and removes repeated and inset boxes', () => {
  const covers = Array.from({ length: 5 }, (_, i) => ({
    x: i * 0.2,
    y: 0.1,
    width: 0.18,
    height: 0.8,
  }));
  const inset = covers.map((box) => ({
    x: box.x + 0.01,
    y: box.y + 0.05,
    width: box.width - 0.02,
    height: box.height - 0.1,
  }));
  assert.equal(mergeBookBounds([...covers, ...covers, ...inset]).length, 5);
  assert.equal(
    mergeBookBounds([...covers.slice(0, 2), ...covers.slice(3), covers[2]])
      .length,
    5,
  );
  assert.equal(
    mergeBookBounds(
      Array.from({ length: 30 }, (_, i) => ({
        x: i,
        y: 0,
        width: 0.5,
        height: 0.8,
      })),
    ).length,
    20,
  );
});

void test('detection completes after crops without any title jobs or language payload', () => {
  const sent: unknown[] = [];
  const crops: string[] = [];
  const done: string[] = [];
  const worker = {
    onmessage: null as null | ((event: { data: unknown }) => void),
    onerror: null,
    onmessageerror: null,
    postMessage: (job: unknown) => sent.push(job),
    terminate() {},
  };
  const queue = createBookRecognitionQueue(
    {
      onCrops: (event) => crops.push(...event.crops.map((crop) => crop.id)),
      onDone: (event) => done.push(event.status),
    },
    { workerFactory: () => worker as unknown as Worker },
  );
  const file = new Blob();
  queue.enqueue(file, 'photo');
  assert.deepEqual(sent, [{ file, photoId: 'photo' }]);
  worker.onmessage?.({
    data: { type: 'crops', photoId: 'photo', crops: [{ id: 'cover' }] },
  });
  worker.onmessage?.({
    data: { type: 'done', photoId: 'photo', status: 'complete' },
  });
  assert.deepEqual(crops, ['cover']);
  assert.deepEqual(done, ['complete']);
  queue.dispose();
});
