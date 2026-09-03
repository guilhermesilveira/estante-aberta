import { getChatGPTUser } from '@/app/chatgpt-auth';
import {
  getOrCreateProfileName,
  getOrCreateShelf,
  getRuntimeEnv,
} from '@/db/repository';

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const profileName = await getOrCreateProfileName(user);
  if (!profileName) {
    return Response.json(
      { error: 'Cadastre seu nome antes de editar a estante.' },
      { status: 422 },
    );
  }
  const shelf = await getOrCreateShelf(user, profileName);
  const body = (await request.json()) as Record<string, unknown>;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof body.published === 'boolean') {
    fields.push('published = ?');
    values.push(body.published ? 1 : 0);
  }
  if (typeof body.name === 'string' && body.name.trim()) {
    fields.push('name = ?');
    values.push(body.name.trim().slice(0, 100));
  }
  if (typeof body.intro === 'string' && body.intro.trim()) {
    fields.push('intro = ?');
    values.push(body.intro.trim().slice(0, 280));
  }
  if (!fields.length)
    return Response.json(
      { error: 'Nenhuma alteração válida.' },
      { status: 400 },
    );
  fields.push('updated_at = ?');
  values.push(Date.now(), shelf.id, user.userId);
  await getRuntimeEnv()
    .DB.prepare(
      `UPDATE shelves SET ${fields.join(', ')} WHERE id = ? AND owner_id = ?`,
    )
    .bind(...values)
    .run();
  return Response.json({ ok: true });
}
