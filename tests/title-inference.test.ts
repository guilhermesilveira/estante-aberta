import assert from 'node:assert/strict';
import test from 'node:test';
import {
  titleLines,
  groundSuggestedTitle,
  validOCRLanguage,
  titlePrompt,
} from '../lib/title-inference.ts';
import { suggestBookTitle } from '../lib/book-detection.ts';
void test('model suggestions must match actual consecutive OCR lines, never invented or translated text', () => {
  const lines = titleLines('JOÃO AUTOR\nO jardim\ndas palavras\n編集者');
  assert.equal(
    groundSuggestedTitle('O jardim das palavras', lines),
    'O jardim das palavras',
  );
  assert.equal(groundSuggestedTitle('編集者', lines), '編集者');
  for (const output of [
    'UNKNOWN',
    '[2,3]',
    'The garden',
    'Jardim das palavras',
    'O jardim encantado',
  ])
    assert.equal(groundSuggestedTitle(output, lines), null);
  assert.equal(
    groundSuggestedTitle("Harry Potter and the Philosopher's Stone", [
      'J. K. ROWLING',
      'HARRY POTTER',
      'AND THE PHILOSOPHER’S STONE',
    ]),
    'HARRY POTTER AND THE PHILOSOPHER’S STONE',
  );
});
void test('OCR inputs are bounded, language is allowlisted and short Unicode titles survive', () => {
  assert.equal(titleLines('x\n'.repeat(50)).length, 32);
  assert.equal(titleLines('x'.repeat(500))[0].length, 160);
  assert.equal(validOCRLanguage('jpn'), 'jpn');
  assert.equal(validOCRLanguage('../../evil'), 'por+eng');
  assert.equal(suggestBookTitle('雪国', 90), '雪国');
  assert.equal(suggestBookTitle('It', 90), 'It');
});
void test('numeric titles remain selectable, and author hallucinations fail closed', () => {
  const lines = titleLines('GEORGE ORWELL\n1984\nISBN 9780000000000');
  assert.equal(groundSuggestedTitle('1984', lines), '1984');
  assert.equal(groundSuggestedTitle('Obras de George Orwell', lines), null);
  assert.equal(titlePrompt(lines)[1].content, lines.join('\n'));
});
