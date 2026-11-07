import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BOOK_TITLE,
  sanitizeBookTitle,
  parseBookUploadId,
} from '../lib/book-title.ts';

void test('optional and blank titles preserve photo-only capture', () => {
  for (const value of [undefined, null, '', ' \n ', '<b></b>'])
    assert.equal(sanitizeBookTitle(value), DEFAULT_BOOK_TITLE);
});
void test('titles remove markup, invisible controls and normalize OCR whitespace', () => {
  assert.equal(
    sanitizeBookTitle('  <b>Ac\u0327a\u0303o</b>\n\t e\u0000 paz\u202e '),
    'Ação e paz',
  );
  assert.equal(sanitizeBookTitle('本の名前 & ciência'), '本の名前 & ciência');
});
void test('title bounds and types are enforced without truncating titles', () => {
  assert.equal(sanitizeBookTitle('x'.repeat(200)).length, 200);
  assert.equal(Array.from(sanitizeBookTitle('📚'.repeat(200))).length, 200);
  for (const value of ['x'.repeat(201), ' '.repeat(2001), {}, [], 17, true])
    assert.throws(() => sanitizeBookTitle(value));
});
void test('upload IDs are optional, normalized v4 UUIDs only', () => {
  assert.equal(parseBookUploadId(undefined), null);
  assert.equal(parseBookUploadId(null), null);
  assert.equal(
    parseBookUploadId('A535067E-95DE-4AEC-843C-58C039648AC5'),
    'a535067e-95de-4aec-843c-58c039648ac5',
  );
  for (const value of [
    '',
    '../photo',
    12,
    {},
    'a535067e-95de-1aec-843c-58c039648ac5',
  ])
    assert.throws(() => parseBookUploadId(value));
});
