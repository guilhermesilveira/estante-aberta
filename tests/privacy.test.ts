import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizePersonName,
  PERSON_NAME_MAX_LENGTH,
} from '../lib/person-name.ts';
import { publicShelfFromRow } from '../lib/public-shelf-data.ts';

void test('public shelf never serializes owner email or owner id', () => {
  const shelf = publicShelfFromRow({
    id: 'shelf-id',
    owner_id: 'private-owner-id',
    owner_email: 'private@example.com',
    owner_name: 'Ana Lima',
    name: 'Estante de Ana Lima',
    slug: 'ana-lima-123456',
    intro: 'Escolha seus livros.',
    published: 1,
  });
  const payload = JSON.stringify(shelf);

  assert.equal(payload.includes('private@example.com'), false);
  assert.equal(payload.includes('private-owner-id'), false);
  assert.deepEqual(Object.keys(shelf).sort(), [
    'id',
    'intro',
    'name',
    'ownerName',
    'published',
    'slug',
  ]);
});

void test('person name accepts at most one space and 21 characters', () => {
  assert.equal(normalizePersonName('  Ana   Lima  '), 'Ana Lima');
  assert.equal(normalizePersonName('Ana Maria Lima'), null);
  assert.equal(normalizePersonName('pessoa@example.com'), null);
  assert.equal(
    normalizePersonName('A'.repeat(PERSON_NAME_MAX_LENGTH)),
    'A'.repeat(21),
  );
  assert.equal(
    normalizePersonName('A'.repeat(PERSON_NAME_MAX_LENGTH + 1)),
    null,
  );
  assert.equal(normalizePersonName(''), null);
});
