import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensureSchema, getRuntimeEnv } from '@/db/repository';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureSchema();
  const { id } = await params;
  const user = await getChatGPTUser();
  const runtime = getRuntimeEnv();
  const row = await runtime.DB
    .prepare(
      `SELECT photo_batches.storage_key, photo_batches.content_type,
              photo_batches.owner_id, shelves.published
       FROM photo_batches JOIN shelves ON shelves.id = photo_batches.shelf_id
       WHERE photo_batches.id = ? LIMIT 1`,
    )
    .bind(id)
    .first<{ storage_key: string; content_type: string; owner_id: string; published: number }>();

  if (!row || (!row.published && user?.userId !== row.owner_id)) {
    return new Response('Foto não encontrada', { status: 404 });
  }
  const object = await runtime.FILES.get(row.storage_key);
  if (!object) return new Response('Foto não encontrada', { status: 404 });

  const headers = new Headers();
  headers.set('content-type', object.httpMetadata?.contentType || row.content_type);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', row.published ? 'public, max-age=86400' : 'private, no-store');
  return new Response(object.body, { headers });
}
