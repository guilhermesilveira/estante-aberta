import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensureSchema, getOrCreateShelf, getRuntimeEnv } from '@/db/repository';

type SubmittedBook = {
  title: string;
  author: string;
  availability: 'loan' | 'donation';
};

const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function cleanBooks(value: unknown): SubmittedBook[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) return null;
  const result: SubmittedBook[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const candidate = entry as Record<string, unknown>;
    const title = typeof candidate.title === 'string' ? candidate.title.trim().slice(0, 180) : '';
    const author = typeof candidate.author === 'string' ? candidate.author.trim().slice(0, 140) : '';
    const availability = candidate.availability === 'donation' ? 'donation' : 'loan';
    if (!title) return null;
    result.push({ title, author, availability });
  }
  return result;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Entre na sua conta para salvar livros.' }, { status: 401 });

  const formData = await request.formData();
  const rawBooks = formData.get('books');
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof rawBooks === 'string' ? rawBooks : '');
  } catch {
    return Response.json({ error: 'Revise os livros antes de salvar.' }, { status: 400 });
  }
  const books = cleanBooks(parsed);
  if (!books) return Response.json({ error: 'Cadastre entre 1 e 40 livros por vez.' }, { status: 400 });

  const fileValue = formData.get('photo');
  const photo = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  if (photo && (!acceptedImageTypes.has(photo.type) || photo.size > 15 * 1024 * 1024)) {
    return Response.json({ error: 'Use uma foto JPG, PNG, WEBP ou GIF de até 15 MB.' }, { status: 400 });
  }

  await ensureSchema();
  const shelf = await getOrCreateShelf(user);
  const runtime = getRuntimeEnv();
  const db = runtime.DB;
  const now = Date.now();
  const photoBatchId = photo ? crypto.randomUUID() : null;
  let storageKey: string | null = null;

  if (photo && photoBatchId) {
    const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : photo.type === 'image/gif' ? 'gif' : 'jpg';
    storageKey = `shelves/${shelf.id}/${photoBatchId}.${extension}`;
    await runtime.FILES.put(storageKey, await photo.arrayBuffer(), {
      httpMetadata: { contentType: photo.type },
      customMetadata: { shelfId: shelf.id, ownerId: user.userId },
    });
  }

  const statements: D1PreparedStatement[] = [];
  if (photo && photoBatchId && storageKey) {
    statements.push(
      db
        .prepare(
          `INSERT INTO photo_batches
           (id, shelf_id, owner_id, storage_key, content_type, status, book_count, created_at)
           VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)`,
        )
        .bind(photoBatchId, shelf.id, user.userId, storageKey, photo.type, books.length, now),
    );
  }

  books.forEach((book, position) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO books
           (id, shelf_id, owner_id, photo_batch_id, title, author, availability, status, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          shelf.id,
          user.userId,
          photoBatchId,
          book.title,
          book.author,
          book.availability,
          position,
          now,
          now,
        ),
    );
  });

  await db.batch(statements);
  return Response.json({ count: books.length, photoBatchId }, { status: 201 });
}
