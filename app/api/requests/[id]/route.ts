import { waitUntil } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensureSchema, getRuntimeEnv } from '@/db/repository';
import { sendRequestStatusNotifications } from '@/lib/web-push';

const validStatuses = new Set(['accepted', 'declined', 'completed']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  await ensureSchema();
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const status = typeof body.status === 'string' ? body.status : '';
  if (!validStatuses.has(status))
    return Response.json({ error: 'Situação inválida.' }, { status: 400 });
  const requestedBookIds = Array.isArray(body.bookIds)
    ? [
        ...new Set(
          body.bookIds.filter(
            (bookId): bookId is string => typeof bookId === 'string',
          ),
        ),
      ]
    : [];

  const db = getRuntimeEnv().DB;
  const ownerRequest = await db
    .prepare(
      `SELECT requests.id, requests.status, requests.requester_id
       FROM requests JOIN shelves ON shelves.id = requests.shelf_id
       WHERE requests.id = ? AND shelves.owner_id = ? LIMIT 1`,
    )
    .bind(id, user.userId)
    .first<{ id: string; status: string; requester_id: string | null }>();
  if (!ownerRequest)
    return Response.json({ error: 'Pedido não encontrado.' }, { status: 404 });

  const linkedBooks = await db
    .prepare(
      `SELECT books.id, books.availability, books.status
       FROM request_books JOIN books ON books.id = request_books.book_id
       WHERE request_books.request_id = ?`,
    )
    .bind(id)
    .all<{ id: string; availability: string; status: string }>();

  const linkedBookIds = new Set(linkedBooks.results.map((book) => book.id));
  if (status === 'accepted') {
    if (!requestedBookIds.length) {
      return Response.json(
        { error: 'Selecione pelo menos um livro para confirmar.' },
        { status: 400 },
      );
    }
    if (requestedBookIds.some((bookId) => !linkedBookIds.has(bookId))) {
      return Response.json(
        { error: 'Um dos livros não pertence a este pedido.' },
        { status: 400 },
      );
    }
    const selectedBooks = linkedBooks.results.filter((book) =>
      requestedBookIds.includes(book.id),
    );
    if (selectedBooks.some((book) => book.status !== 'available')) {
      return Response.json(
        { error: 'Um dos livros já está reservado ou entregue.' },
        { status: 409 },
      );
    }
  }

  const now = Date.now();
  const confirmedCount = status === 'accepted' ? requestedBookIds.length : 0;
  const unavailableCount =
    status === 'accepted'
      ? linkedBooks.results.length - requestedBookIds.length
      : status === 'declined'
        ? linkedBooks.results.length
        : 0;
  const statusStatement =
    status === 'accepted' || status === 'declined'
      ? db
          .prepare(
            `UPDATE requests
             SET status = ?, confirmed_count = ?, unavailable_count = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(status, confirmedCount, unavailableCount, now, id)
      : db
          .prepare(
            'UPDATE requests SET status = ?, updated_at = ? WHERE id = ?',
          )
          .bind(status, now, id);
  const statements: D1PreparedStatement[] = [statusStatement];

  if (status === 'accepted') {
    linkedBooks.results.forEach((book) => {
      if (requestedBookIds.includes(book.id)) {
        statements.push(
          db
            .prepare(
              `UPDATE books SET status = 'reserved', updated_at = ? WHERE id = ?`,
            )
            .bind(now, book.id),
        );
      } else {
        statements.push(
          db
            .prepare(
              'DELETE FROM request_books WHERE request_id = ? AND book_id = ?',
            )
            .bind(id, book.id),
        );
      }
    });
  } else if (status === 'declined' && ownerRequest.status === 'accepted') {
    linkedBooks.results.forEach((book) => {
      statements.push(
        db
          .prepare(
            `UPDATE books SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`,
          )
          .bind(now, book.id),
      );
    });
  } else if (status === 'completed') {
    linkedBooks.results.forEach((book) => {
      const finalStatus = book.availability === 'donation' ? 'given' : 'loaned';
      statements.push(
        db
          .prepare('UPDATE books SET status = ?, updated_at = ? WHERE id = ?')
          .bind(finalStatus, now, book.id),
      );
    });
  }

  await db.batch(statements);
  if (
    ownerRequest.status === 'pending' &&
    (status === 'accepted' || status === 'declined') &&
    ownerRequest.requester_id
  ) {
    waitUntil(
      sendRequestStatusNotifications(ownerRequest.requester_id, {
        requestId: id,
        status,
        confirmedCount,
        unavailableCount,
      }),
    );
  }
  return Response.json({ ok: true });
}
