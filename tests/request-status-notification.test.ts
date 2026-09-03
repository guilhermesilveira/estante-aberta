import assert from 'node:assert/strict';
import test from 'node:test';

import { requestStatusNotification } from '../lib/request-status-notification.ts';

void test('confirmation notification reports confirmed and unavailable books', () => {
  assert.deepEqual(
    requestStatusNotification({
      requestId: 'request-123',
      status: 'accepted',
      confirmedCount: 2,
      unavailableCount: 1,
    }),
    {
      title: 'Pedido confirmado',
      body: '2 livros confirmados. 1 livro não pôde ser separado.',
      tag: 'pedido-status-request-123',
      url: '/meus-pedidos/request-123',
    },
  );
});

void test('confirmation notification uses singular grammar', () => {
  assert.equal(
    requestStatusNotification({
      requestId: 'request-123',
      status: 'accepted',
      confirmedCount: 1,
      unavailableCount: 0,
    }).body,
    '1 livro confirmado.',
  );
});

void test('declined notification reports all unavailable books', () => {
  assert.equal(
    requestStatusNotification({
      requestId: 'request-123',
      status: 'declined',
      confirmedCount: 0,
      unavailableCount: 3,
    }).body,
    'Nenhum dos 3 livros do seu pedido pôde ser separado.',
  );
});

void test('declined notification uses singular grammar', () => {
  assert.equal(
    requestStatusNotification({
      requestId: 'request-123',
      status: 'declined',
      confirmedCount: 0,
      unavailableCount: 1,
    }).body,
    'O livro do seu pedido não pôde ser separado.',
  );
});
