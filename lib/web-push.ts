import { env } from 'cloudflare:workers';
import webPush, { WebPushError } from 'web-push';

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PushRuntimeEnv = Cloudflare.Env & {
  DB: D1Database;
};

export type NewRequestNotification = {
  requestId: string;
  requesterName: string;
  bookCount: number;
};

function getPushRuntime() {
  return env as PushRuntimeEnv;
}

export function getVapidPublicKey(): string | null {
  return getPushRuntime().VAPID_PUBLIC_KEY?.trim() || null;
}

export async function sendNewRequestNotifications(
  shelfId: string,
  notification: NewRequestNotification,
) {
  const runtime = getPushRuntime();
  const publicKey = runtime.VAPID_PUBLIC_KEY?.trim();
  const privateKey = runtime.VAPID_PRIVATE_KEY?.trim();
  const subject = runtime.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) {
    console.error('Web Push não configurado: faltam variáveis VAPID.');
    return;
  }

  const subscriptions = await runtime.DB.prepare(
    `SELECT id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE shelf_id = ?`,
  )
    .bind(shelfId)
    .all<PushSubscriptionRow>();
  if (!subscriptions.results.length) return;

  const bookLabel =
    notification.bookCount === 1
      ? '1 livro'
      : `${notification.bookCount} livros`;
  const payload = JSON.stringify({
    title: 'Novo pedido na sua estante',
    body: `${notification.requesterName} pediu ${bookLabel}.`,
    tag: `pedido-${notification.requestId}`,
    url: `/minha-estante#pedido-${notification.requestId}`,
  });

  const expiredSubscriptionIds: string[] = [];
  await Promise.all(
    subscriptions.results.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
          {
            TTL: 300,
            urgency: 'high',
            topic: `pedido-${notification.requestId.replace(/-/g, '').slice(0, 20)}`,
            vapidDetails: { subject, publicKey, privateKey },
          },
        );
      } catch (error) {
        if (
          error instanceof WebPushError &&
          (error.statusCode === 404 || error.statusCode === 410)
        ) {
          expiredSubscriptionIds.push(subscription.id);
          return;
        }
        console.error(
          'Não foi possível enviar uma notificação Web Push.',
          error,
        );
      }
    }),
  );

  if (expiredSubscriptionIds.length) {
    await runtime.DB.batch(
      expiredSubscriptionIds.map((id) =>
        runtime.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(
          id,
        ),
      ),
    );
  }
}
