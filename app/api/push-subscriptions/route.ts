import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensureSchema, getOrCreateShelf, getRuntimeEnv } from '@/db/repository';
import { getVapidPublicKey } from '@/lib/web-push';

type SubscriptionBody = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_048) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function validKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 16 &&
    value.length <= 512 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return Response.json(
      { error: 'As notificações ainda não estão disponíveis.' },
      { status: 503 },
    );
  }
  return Response.json({ publicKey });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const body = (await request.json()) as SubscriptionBody;
  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!validEndpoint(endpoint) || !validKey(p256dh) || !validKey(auth)) {
    return Response.json(
      { error: 'Inscrição de notificação inválida.' },
      { status: 400 },
    );
  }

  await ensureSchema();
  const shelf = await getOrCreateShelf(user);
  const db = getRuntimeEnv().DB;
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO push_subscriptions
       (id, shelf_id, owner_id, endpoint, p256dh, auth, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         shelf_id = excluded.shelf_id,
         owner_id = excluded.owner_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         updated_at = excluded.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      shelf.id,
      user.userId,
      endpoint,
      p256dh,
      auth,
      now,
      now,
    )
    .run();

  return Response.json({ ok: true }, { status: 201 });
}
