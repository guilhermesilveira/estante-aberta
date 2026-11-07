import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  ensureSchema,
  getOrCreateProfileName,
  getOrCreateShelf,
  getRuntimeEnv,
} from '@/db/repository';
import { parseBookUploadId, sanitizeBookTitle } from '@/lib/book-title';
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

  let formData: FormData;
  let title: string;
  let uploadId: string | null;
  try {
    formData = await request.formData();
    title = sanitizeBookTitle(formData.get('title'));
    uploadId = parseBookUploadId(formData.get('uploadId'));
  } catch {
    return Response.json(
      {
        error:
          'Envio inválido. Use um título de até 200 caracteres e um identificador de envio válido.',
      },
      { status: 400 },
    );
  }
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
  const findUpload = () =>
    db
      .prepare(
        'SELECT id, owner_id, photo_batch_id, status, title, availability, updated_at FROM books WHERE id = ? LIMIT 1',
      )
      .bind(bookId)
      .first<{
        id: string;
        owner_id: string;
        photo_batch_id: string;
        status: string;
        title: string;
        availability: string;
        updated_at: number;
      }>();
  const replayResponse = (existing: {
    id: string;
    owner_id: string;
    photo_batch_id: string;
    status: string;
    title: string;
    availability: string;
    updated_at: number;
  }) => {
    if (existing.owner_id !== user.userId || existing.status === 'removed') {
      return Response.json(
        { error: 'Identificador de envio indisponível.' },
        { status: 409 },
      );
    }
    return Response.json(
      {
        bookId: existing.id,
        photoBatchId: existing.photo_batch_id,
        isFirstBook: false,
        title: existing.title,
        availability: existing.availability,
        updatedAt: existing.updated_at,
      },
      { status: 200 },
    );
  };
  const bookId = uploadId ?? crypto.randomUUID();
  if (uploadId) {
    const existing = await findUpload();
    if (existing) return replayResponse(existing);
  }
  const previousBook = await db
    .prepare('SELECT id FROM books WHERE owner_id = ? LIMIT 1')
    .bind(user.userId)
    .first<{ id: string }>();
  const now = Date.now();
  const photoBatchId = crypto.randomUUID();
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

  try {
    // D1 batches roll back together: a concurrent retry cannot create a second photo batch.
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
         VALUES (?, ?, ?, ?, ?, '', ?, 'available', 0, ?, ?)`,
        )
        .bind(
          bookId,
          shelf.id,
          user.userId,
          photoBatchId,
          title,
          availability,
          now,
          now,
        ),
    ]);
  } catch (error) {
    // A timeout may have committed. Never delete the successful attempt's photo.
    const existing = await findUpload();
    if (existing && existing.photo_batch_id !== photoBatchId) {
      await runtime.FILES.delete(storageKey).catch(() => undefined);
    }
    if (existing && uploadId) return replayResponse(existing);
    throw error;
  }
  return Response.json(
    {
      bookId,
      photoBatchId,
      isFirstBook: !previousBook,
      title,
      availability,
      updatedAt: now,
    },
    { status: 201 },
  );
}
