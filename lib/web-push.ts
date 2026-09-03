import { env } from 'cloudflare:workers';
import webPush, { WebPushError } from 'web-push';

import {
  requestStatusNotification,
  type PushNotificationPayload,
  type RequestStatusNotificationInput,
} from '@/lib/request-status-notification';

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
  const owner = await runtime.DB.prepare(
    'SELECT owner_id FROM shelves WHERE id = ? LIMIT 1',
  )
    .bind(shelfId)
    .first<{ owner_id: string }>();
  if (!owner) return;

  const bookLabel =
    notification.bookCount === 1
      ? '1 livro'
      : `${notification.bookCount} livros`;
  await sendUserNotifications(
    owner.owner_id,
    {
      title: 'Novo pedido na sua estante',
      body: `${notification.requesterName} pediu ${bookLabel}.`,
      tag: `pedido-${notification.requestId}`,
      url: `/minha-estante#pedido-${notification.requestId}`,
    },
    `pedido-${notification.requestId}`,
  );
}

export async function sendRequestStatusNotifications(
  requesterId: string,
  notification: RequestStatusNotificationInput,
) {
  await sendUserNotifications(
    requesterId,
    requestStatusNotification(notification),
    `status-${notification.requestId}`,
  );
}

async function sendUserNotifications(
  userId: string,
  notification: PushNotificationPayload,
  topic: string,
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
     WHERE user_id = ?`,
  )
    .bind(userId)
    .all<PushSubscriptionRow>();
  if (!subscriptions.results.length) return;

  const payload = JSON.stringify(notification);

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
            topic: topic.replace(/-/g, '').slice(0, 32),
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
