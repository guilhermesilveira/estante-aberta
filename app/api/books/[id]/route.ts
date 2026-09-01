import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensureSchema, getRuntimeEnv } from '@/db/repository';

const validStatuses = new Set(['available', 'reserved', 'loaned', 'given']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  await ensureSchema();
  const { id } = await params;
  const db = getRuntimeEnv().DB;
  const existing = await db
    .prepare('SELECT id FROM books WHERE id = ? AND owner_id = ? AND status != ? LIMIT 1')
    .bind(id, user.userId, 'removed')
    .first();
  if (!existing) return Response.json({ error: 'Livro não encontrado.' }, { status: 404 });

  const body = (await request.json()) as Record<string, unknown>;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.availability === 'loan' || body.availability === 'donation') {
    fields.push('availability = ?');
    values.push(body.availability);
  }
  if (typeof body.status === 'string' && validStatuses.has(body.status)) {
    fields.push('status = ?');
    values.push(body.status);
  }
  if (typeof body.title === 'string' && body.title.trim()) {
    fields.push('title = ?');
    values.push(body.title.trim().slice(0, 180));
  }
  if (typeof body.author === 'string') {
    fields.push('author = ?');
    values.push(body.author.trim().slice(0, 140));
  }
  if (!fields.length) return Response.json({ error: 'Nenhuma alteração válida.' }, { status: 400 });
  fields.push('updated_at = ?');
  values.push(Date.now(), id, user.userId);

  await db
    .prepare(`UPDATE books SET ${fields.join(', ')} WHERE id = ? AND owner_id = ?`)
    .bind(...values)
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  await ensureSchema();
  const { id } = await params;
  const result = await getRuntimeEnv().DB
    .prepare(`UPDATE books SET status = 'removed', updated_at = ? WHERE id = ? AND owner_id = ?`)
    .bind(Date.now(), id, user.userId)
    .run();
  if (!result.meta.changes) return Response.json({ error: 'Livro não encontrado.' }, { status: 404 });
  return Response.json({ ok: true });
}
