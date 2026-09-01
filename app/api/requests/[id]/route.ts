import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensureSchema, getRuntimeEnv } from '@/db/repository';

const validStatuses = new Set(['accepted', 'declined', 'completed']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  await ensureSchema();
  const { id } = await params;
  const body = (await request.json()) as Record<string, unknown>;
  const status = typeof body.status === 'string' ? body.status : '';
  if (!validStatuses.has(status)) return Response.json({ error: 'Situação inválida.' }, { status: 400 });

  const db = getRuntimeEnv().DB;
  const ownerRequest = await db
    .prepare(
      `SELECT requests.id, requests.status
       FROM requests JOIN shelves ON shelves.id = requests.shelf_id
       WHERE requests.id = ? AND shelves.owner_id = ? LIMIT 1`,
    )
    .bind(id, user.userId)
    .first<{ id: string; status: string }>();
  if (!ownerRequest) return Response.json({ error: 'Pedido não encontrado.' }, { status: 404 });

  const linkedBooks = await db
    .prepare(
      `SELECT books.id, books.availability, books.status
       FROM request_books JOIN books ON books.id = request_books.book_id
       WHERE request_books.request_id = ?`,
    )
    .bind(id)
    .all<{ id: string; availability: string; status: string }>();

  if (status === 'accepted' && linkedBooks.results.some((book) => book.status !== 'available')) {
    return Response.json({ error: 'Um dos livros já está reservado ou entregue.' }, { status: 409 });
  }

  const now = Date.now();
  const statements: D1PreparedStatement[] = [
    db.prepare('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?').bind(status, now, id),
  ];

  if (status === 'accepted') {
    linkedBooks.results.forEach((book) => {
      statements.push(db.prepare(`UPDATE books SET status = 'reserved', updated_at = ? WHERE id = ?`).bind(now, book.id));
    });
  } else if (status === 'declined' && ownerRequest.status === 'accepted') {
    linkedBooks.results.forEach((book) => {
      statements.push(db.prepare(`UPDATE books SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`).bind(now, book.id));
    });
  } else if (status === 'completed') {
    linkedBooks.results.forEach((book) => {
      const finalStatus = book.availability === 'donation' ? 'given' : 'loaned';
      statements.push(db.prepare('UPDATE books SET status = ?, updated_at = ? WHERE id = ?').bind(finalStatus, now, book.id));
    });
  }

  await db.batch(statements);
  return Response.json({ ok: true });
}
