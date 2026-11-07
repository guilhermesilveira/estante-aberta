import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canApplySuggestedTitle,
  clampCrop,
  cropFromPoints,
  MAX_CAPTURE_BYTES,
  validateCaptureFile,
} from '../lib/capture-drafts.ts';

void test('capture rejects unsupported, empty, oversized and over-budget files', () => {
  assert.equal(
    validateCaptureFile(
      { type: 'image/jpeg', size: 100 },
      { count: 0, bytes: 0 },
    ),
    null,
  );
  assert.ok(
    validateCaptureFile(
      { type: 'image/heic', size: 100 },
      { count: 0, bytes: 0 },
    ),
  );
  assert.ok(
    validateCaptureFile({ type: 'image/png', size: 0 }, { count: 0, bytes: 0 }),
  );
  assert.ok(
    validateCaptureFile(
      { type: 'image/png', size: 16 * 1024 * 1024 },
      { count: 0, bytes: 0 },
    ),
  );
  assert.ok(
    validateCaptureFile(
      { type: 'image/png', size: 100 },
      { count: 8, bytes: 0 },
    ),
  );
  assert.ok(
    validateCaptureFile(
      { type: 'image/png', size: 100 },
      { count: 1, bytes: MAX_CAPTURE_BYTES },
    ),
  );
});

void test('crop stays within image with minimum area and invalid values', () => {
  assert.deepEqual(clampCrop({ x: -1, y: 2, width: 3, height: -1 }), {
    x: 0,
    y: 0.97,
    width: 1,
    height: 0.03,
  });
  assert.deepEqual(clampCrop({ x: NaN, y: NaN, width: NaN, height: NaN }), {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  assert.deepEqual(cropFromPoints({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.1 }), {
    x: 0.2,
    y: 0.1,
    width: 0.6000000000000001,
    height: 0.8,
  });
});

void test('late OCR never overwrites a manually edited or removed title', () => {
  assert.equal(canApplySuggestedTitle(false, false), true);
  assert.equal(canApplySuggestedTitle(true, false), false);
  assert.equal(canApplySuggestedTitle(false, true), false);
});
