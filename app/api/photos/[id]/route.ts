import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  ensureSchema,
  getRuntimeEnv,
  sanitizeStoredPhoto,
} from '@/db/repository';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureSchema();
  const { id } = await params;
  const user = await getChatGPTUser();
  const runtime = getRuntimeEnv();
  const row = await runtime.DB.prepare(
    `SELECT photo_batches.id, photo_batches.storage_key,
              photo_batches.content_type, photo_batches.status,
              photo_batches.owner_id, shelves.published
       FROM photo_batches
       JOIN shelves ON shelves.id = photo_batches.shelf_id
       JOIN books ON books.photo_batch_id = photo_batches.id
       WHERE photo_batches.id = ?
         AND books.status IN ('available', 'reserved', 'loaned')
       LIMIT 1`,
  )
    .bind(id)
    .first<{
      id: string;
      storage_key: string;
      content_type: string;
      status: string;
      owner_id: string;
      published: number;
    }>();

  if (!row || (!row.published && user?.userId !== row.owner_id)) {
    return new Response('Foto não encontrada', { status: 404 });
  }
  let photo: Awaited<ReturnType<typeof sanitizeStoredPhoto>>;
  try {
    photo = await sanitizeStoredPhoto({
      id: row.id,
      storageKey: row.storage_key,
      contentType: row.content_type,
      status: row.status,
    });
  } catch {
    return new Response('Foto não encontrada', { status: 404 });
  }

  const headers = new Headers();
  headers.set('content-type', row.content_type);
  if (photo.etag) headers.set('etag', photo.etag);
  headers.set('cache-control', 'private, no-store');
  return new Response(photo.bytes.slice().buffer as ArrayBuffer, { headers });
}
