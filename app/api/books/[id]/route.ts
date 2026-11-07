import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensureSchema, getRuntimeEnv } from '@/db/repository';

import { sanitizeBookTitle } from '@/lib/book-title';

const validStatuses = new Set(['available', 'reserved', 'loaned', 'given']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  await ensureSchema();
  const { id } = await params;
  const db = getRuntimeEnv().DB;
  const readCurrent = () =>
    db
      .prepare(
        'SELECT id, title, availability, updated_at FROM books WHERE id = ? AND owner_id = ? AND status != ? LIMIT 1',
      )
      .bind(id, user.userId, 'removed')
      .first<{
        id: string;
        title: string;
        availability: string;
        updated_at: number;
      }>();
  const existing = await readCurrent();
  if (!existing)
    return Response.json({ error: 'Livro não encontrado.' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Invalid body');
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: 'Envie alterações válidas.' },
      { status: 400 },
    );
  }
  const hasExpectedVersion = Object.hasOwn(body, 'expectedUpdatedAt');
  if (
    hasExpectedVersion &&
    (typeof body.expectedUpdatedAt !== 'number' ||
      !Number.isSafeInteger(body.expectedUpdatedAt) ||
      body.expectedUpdatedAt <= 0)
  ) {
    return Response.json(
      { error: 'Versão do livro inválida.' },
      { status: 400 },
    );
  }
  const fields: string[] = [];
  const values: unknown[] = [];
  if (Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string')
      return Response.json(
        { error: 'Informe um título de até 200 caracteres.' },
        { status: 400 },
      );
    try {
      fields.push('title = ?');
      values.push(sanitizeBookTitle(body.title));
    } catch {
      return Response.json(
        { error: 'Informe um título de até 200 caracteres.' },
        { status: 400 },
      );
    }
  }
  if (body.availability === 'loan' || body.availability === 'donation') {
    fields.push('availability = ?');
    values.push(body.availability);
  }
  if (typeof body.status === 'string' && validStatuses.has(body.status)) {
    fields.push('status = ?');
    values.push(body.status);
  }
  if (!fields.length)
    return Response.json(
      { error: 'Nenhuma alteração válida.' },
      { status: 400 },
    );
  // Increment inside the SQL statement, including legacy callers without a version.
  // RETURNING ties the returned version to this write, not a later concurrent update.
  fields.push('updated_at = MAX(?, updated_at + 1)');
  values.push(Date.now(), id, user.userId, 'removed');
  if (hasExpectedVersion) values.push(body.expectedUpdatedAt);
  const updated = await db
    .prepare(
      `UPDATE books SET ${fields.join(', ')} WHERE id = ? AND owner_id = ? AND status != ?${hasExpectedVersion ? ' AND updated_at = ?' : ''} RETURNING updated_at`,
    )
    .bind(...values)
    .first<{ updated_at: number }>();
  if (!updated) {
    const current = await readCurrent();
    if (!current)
      return Response.json({ error: 'Livro não encontrado.' }, { status: 404 });
    return Response.json(
      {
        error: 'O livro mudou. Atualize a versão e tente novamente.',
        title: current.title,
        availability: current.availability,
        updatedAt: current.updated_at,
      },
      { status: 409 },
    );
  }
  return Response.json({ ok: true, updatedAt: updated.updated_at });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  await ensureSchema();
  const { id } = await params;
  const result = await getRuntimeEnv()
    .DB.prepare(
      `UPDATE books SET status = 'removed', updated_at = MAX(?, updated_at + 1) WHERE id = ? AND owner_id = ?`,
    )
    .bind(Date.now(), id, user.userId)
    .run();
  if (!result.meta.changes)
    return Response.json({ error: 'Livro não encontrado.' }, { status: 404 });
  return Response.json({ ok: true });
}
