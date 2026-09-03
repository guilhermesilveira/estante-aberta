import { waitUntil } from 'cloudflare:workers';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  ensureSchema,
  getOrCreateProfileName,
  getRuntimeEnv,
} from '@/db/repository';
import { sendNewRequestNotifications } from '@/lib/web-push';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Entre na sua conta para pedir livros.' },
      { status: 401 },
    );
  const requesterName = await getOrCreateProfileName(user);
  if (!requesterName) {
    return Response.json(
      { error: 'Cadastre seu nome antes de fazer um pedido.' },
      { status: 422 },
    );
  }
  const body = (await request.json()) as Record<string, unknown>;
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const bookIds = Array.isArray(body.bookIds)
    ? [
        ...new Set(
          body.bookIds.filter((id): id is string => typeof id === 'string'),
        ),
      ]
    : [];

  if (!slug || bookIds.length < 1) {
    return Response.json(
      { error: 'Escolha pelo menos um livro.' },
      { status: 400 },
    );
  }

  await ensureSchema();
  const db = getRuntimeEnv().DB;
  const shelf = await db
    .prepare('SELECT id FROM shelves WHERE slug = ? AND published = 1 LIMIT 1')
    .bind(slug)
    .first<{ id: string }>();
  if (!shelf)
    return Response.json(
      { error: 'Esta estante não está disponível.' },
      { status: 404 },
    );

  const placeholders = bookIds.map(() => '?').join(', ');
  const available = await db
    .prepare(
      `SELECT id FROM books
       WHERE shelf_id = ? AND status = 'available' AND id IN (${placeholders})`,
    )
    .bind(shelf.id, ...bookIds)
    .all<{ id: string }>();
  if (available.results.length !== bookIds.length) {
    return Response.json(
      {
        error:
          'Um dos livros acabou de ficar indisponível. Atualize a estante.',
      },
      { status: 409 },
    );
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO requests
         (id, shelf_id, requester_id, requester_name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .bind(id, shelf.id, user.userId, requesterName, now, now),
    ...bookIds.map((bookId) =>
      db
        .prepare(
          'INSERT INTO request_books (request_id, book_id) VALUES (?, ?)',
        )
        .bind(id, bookId),
    ),
  ]);

  waitUntil(
    sendNewRequestNotifications(shelf.id, {
      requestId: id,
      requesterName,
      bookCount: bookIds.length,
    }),
  );

  return Response.json(
    { id, code: id.replace(/-/g, '').slice(0, 6).toUpperCase() },
    { status: 201 },
  );
}
