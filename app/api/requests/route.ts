import { ensureSchema, getRuntimeEnv } from '@/db/repository';

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const requesterName = typeof body.requesterName === 'string' ? body.requesterName.trim().slice(0, 80) : '';
  const requesterContact = typeof body.requesterContact === 'string' ? body.requesterContact.trim().slice(0, 120) : '';
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 400) : '';
  const bookIds = Array.isArray(body.bookIds)
    ? [...new Set(body.bookIds.filter((id): id is string => typeof id === 'string'))]
    : [];

  if (!slug || !requesterName || bookIds.length < 1 || bookIds.length > 8) {
    return Response.json({ error: 'Escolha de 1 a 8 livros e informe seu nome.' }, { status: 400 });
  }

  await ensureSchema();
  const db = getRuntimeEnv().DB;
  const shelf = await db
    .prepare('SELECT id FROM shelves WHERE slug = ? AND published = 1 LIMIT 1')
    .bind(slug)
    .first<{ id: string }>();
  if (!shelf) return Response.json({ error: 'Esta estante não está disponível.' }, { status: 404 });

  const placeholders = bookIds.map(() => '?').join(', ');
  const available = await db
    .prepare(
      `SELECT id FROM books
       WHERE shelf_id = ? AND status = 'available' AND id IN (${placeholders})`,
    )
    .bind(shelf.id, ...bookIds)
    .all<{ id: string }>();
  if (available.results.length !== bookIds.length) {
    return Response.json({ error: 'Um dos livros acabou de ficar indisponível. Atualize a estante.' }, { status: 409 });
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db
      .prepare(
        `INSERT INTO requests
         (id, shelf_id, requester_name, requester_contact, note, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .bind(id, shelf.id, requesterName, requesterContact, note, now, now),
    ...bookIds.map((bookId) =>
      db.prepare('INSERT INTO request_books (request_id, book_id) VALUES (?, ?)').bind(id, bookId),
    ),
  ]);

  return Response.json({ code: id.replace(/-/g, '').slice(0, 6).toUpperCase() }, { status: 201 });
}
