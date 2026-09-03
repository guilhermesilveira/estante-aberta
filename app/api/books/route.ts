import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  ensureSchema,
  getOrCreateProfileName,
  getOrCreateShelf,
  getRuntimeEnv,
} from '@/db/repository';
import { stripImageMetadata } from '@/lib/photo-metadata';

const acceptedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: 'Entre na sua conta para salvar livros.' },
      { status: 401 },
    );
  const profileName = await getOrCreateProfileName(user);
  if (!profileName) {
    return Response.json(
      { error: 'Cadastre seu nome antes de salvar livros.' },
      { status: 422 },
    );
  }

  const formData = await request.formData();
  const rawAvailability = formData.get('availability');
  const availability =
    rawAvailability === 'donation' || rawAvailability === 'loan'
      ? rawAvailability
      : null;
  if (!availability)
    return Response.json(
      { error: 'Escolha doação ou empréstimo.' },
      { status: 400 },
    );

  const fileValue = formData.get('photo');
  const photo =
    fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  if (!photo)
    return Response.json(
      { error: 'Tire ou envie uma foto do livro.' },
      { status: 400 },
    );
  if (!acceptedImageTypes.has(photo.type) || photo.size > 15 * 1024 * 1024) {
    return Response.json(
      { error: 'Use uma foto JPG, PNG, WEBP ou GIF de até 15 MB.' },
      { status: 400 },
    );
  }

  await ensureSchema();
  const shelf = await getOrCreateShelf(user, profileName);
  const runtime = getRuntimeEnv();
  const db = runtime.DB;
  const previousBook = await db
    .prepare('SELECT id FROM books WHERE owner_id = ? LIMIT 1')
    .bind(user.userId)
    .first<{ id: string }>();
  const now = Date.now();
  const photoBatchId = crypto.randomUUID();
  const bookId = crypto.randomUUID();
  const extension =
    photo.type === 'image/png'
      ? 'png'
      : photo.type === 'image/webp'
        ? 'webp'
        : photo.type === 'image/gif'
          ? 'gif'
          : 'jpg';
  const storageKey = `shelves/${shelf.id}/${photoBatchId}.${extension}`;
  let sanitizedPhoto: Uint8Array;
  try {
    sanitizedPhoto = stripImageMetadata(
      new Uint8Array(await photo.arrayBuffer()),
      photo.type,
    ).bytes;
  } catch {
    return Response.json(
      { error: 'A foto está inválida ou corrompida.' },
      { status: 400 },
    );
  }
  await runtime.FILES.put(storageKey, sanitizedPhoto, {
    httpMetadata: { contentType: photo.type },
    customMetadata: { shelfId: shelf.id, ownerId: user.userId },
  });

  await db.batch([
    db
      .prepare(
        `INSERT INTO photo_batches
         (id, shelf_id, owner_id, storage_key, content_type, status, book_count, created_at)
         VALUES (?, ?, ?, ?, ?, 'sanitized', 1, ?)`,
      )
      .bind(photoBatchId, shelf.id, user.userId, storageKey, photo.type, now),
    db
      .prepare(
        `INSERT INTO books
         (id, shelf_id, owner_id, photo_batch_id, title, author, availability, status, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'Livro fotografado', '', ?, 'available', 0, ?, ?)`,
      )
      .bind(
        bookId,
        shelf.id,
        user.userId,
        photoBatchId,
        availability,
        now,
        now,
      ),
  ]);
  return Response.json(
    { bookId, photoBatchId, isFirstBook: !previousBook },
    { status: 201 },
  );
}
