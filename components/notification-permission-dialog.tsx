'use client';

import { useEffect, useRef, useState } from 'react';
import { BellRing, Check, LoaderCircle, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';

type PermissionStep =
  | 'intro'
  | 'working'
  | 'success'
  | 'denied'
  | 'unavailable'
  | 'error';

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function supportsWebPush() {
  return (
    window.isSecureContext &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

const copy = {
  'new-requests': {
    title: 'Quer receber aviso de novos pedidos?',
    intro:
      'Quando alguém pedir um ou mais livros, o navegador pode mostrar uma notificação no seu celular ou computador, mesmo com a Estante Aberta fechada.',
    success: 'Você receberá um aviso quando chegar um novo pedido de livros.',
  },
  'request-updates': {
    title: 'Quer receber a confirmação do pedido?',
    intro:
      'Quando a pessoa dona da estante confirmar quais livros vai entregar, o navegador pode avisar no seu celular ou computador, mesmo com a Estante Aberta fechada.',
    success:
      'Você receberá um aviso quando os livros do seu pedido forem confirmados.',
  },
} as const;

export function NotificationPermissionDialog({
  completionLabel = 'Continuar cadastrando',
  reason = 'new-requests',
  onComplete,
}: {
  completionLabel?: string;
  reason?: keyof typeof copy;
  onComplete: () => void;
}) {
  const [step, setStep] = useState<PermissionStep>('intro');
  const [message, setMessage] = useState('');
  const primaryButton = useRef<HTMLButtonElement>(null);
  const content = copy[reason];

  useEffect(() => {
    primaryButton.current?.focus();
  }, []);

  async function enableNotifications() {
    if (!supportsWebPush()) {
      setStep('unavailable');
      return;
    }

    setStep('working');
    setMessage('');
    try {
      const permission =
        Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission;
      if (permission !== 'granted') {
        setStep('denied');
        return;
      }

      const keyResponse = await fetch('/api/push-subscriptions');
      const keyPayload = (await keyResponse.json()) as {
        publicKey?: string;
        error?: string;
      };
      if (!keyResponse.ok || !keyPayload.publicKey) {
        throw new Error(
          keyPayload.error || 'Não foi possível preparar as notificações.',
        );
      }

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      const readyRegistration = await navigator.serviceWorker.ready;
      const existingSubscription =
        await readyRegistration.pushManager.getSubscription();
      const subscription =
        existingSubscription ??
        (await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(keyPayload.publicKey),
        }));

      const saveResponse = await fetch('/api/push-subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      const savePayload = (await saveResponse.json()) as { error?: string };
      if (!saveResponse.ok) {
        throw new Error(
          savePayload.error || 'Não foi possível ativar as notificações.',
        );
      }

      await registration.update();
      setStep('success');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível ativar as notificações.',
      );
      setStep('error');
    }
  }

  const finished = step === 'success';
  const hasProblem =
    step === 'denied' || step === 'unavailable' || step === 'error';

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-end bg-[#10261f]/70 pt-3 backdrop-blur-sm sm:place-items-center sm:p-6"
      role="presentation"
    >
      <dialog
        open
        aria-describedby="notification-permission-description"
        aria-labelledby="notification-permission-title"
        aria-modal="true"
        className="relative m-0 max-h-[calc(100dvh-0.75rem)] w-full max-w-lg overflow-y-auto rounded-t-[28px] border-0 bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-foreground shadow-[0_28px_90px_rgb(10_30_24/35%)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[28px] sm:p-7"
      >
        <span
          className={`grid size-12 place-items-center rounded-2xl ${finished ? 'bg-[#e8f2ed] text-[#275b4b]' : hasProblem ? 'bg-[#fff0eb] text-[#a74630]' : 'bg-[#fff7dd] text-[#7a5e12]'}`}
        >
          {finished ? (
            <Check className="size-6" />
          ) : hasProblem ? (
            <TriangleAlert className="size-6" />
          ) : (
            <BellRing className="size-6" />
          )}
        </span>

        <h2
          className="mt-4 font-heading text-[1.75rem] font-bold leading-tight tracking-[-0.045em] sm:text-3xl"
          id="notification-permission-title"
        >
          {step === 'success'
            ? 'Notificações ativadas'
            : step === 'denied'
              ? 'Permissão não concedida'
              : step === 'unavailable'
                ? 'Notificações indisponíveis aqui'
                : step === 'error'
                  ? 'Não foi possível ativar'
                  : content.title}
        </h2>

        <div
          className="mt-3 space-y-3 text-[0.95rem] leading-6 text-muted-foreground sm:text-base sm:leading-7"
          id="notification-permission-description"
        >
          {step === 'intro' && (
            <>
              <p>{content.intro}</p>
              <p>
                Ao continuar, o próprio navegador abrirá o pedido padrão de
                autorização. Você pode negar e seguir usando o site normalmente.
              </p>
            </>
          )}
          {step === 'working' && <p>Aguardando a autorização do navegador…</p>}
          {step === 'success' && <p>{content.success}</p>}
          {step === 'denied' && (
            <p>
              Tudo bem. O restante do site continua funcionando. Se mudar de
              ideia, você poderá liberar a Estante Aberta nas configurações do
              navegador.
            </p>
          )}
          {step === 'unavailable' && (
            <p>
              Este navegador não oferece notificações para o site neste modo. No
              iPhone ou iPad, adicione a Estante Aberta à Tela de Início e abra
              por lá para usar notificações.
            </p>
          )}
          {step === 'error' && <p>{message}</p>}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {step === 'intro' && (
            <Button
              className="h-12 w-full rounded-2xl sm:w-auto"
              variant="ghost"
              onClick={onComplete}
            >
              Agora não
            </Button>
          )}
          {step === 'intro' && (
            <Button
              ref={primaryButton}
              className="h-12 w-full rounded-2xl px-5 sm:w-auto"
              onClick={enableNotifications}
            >
              <BellRing /> Continuar e permitir
            </Button>
          )}
          {step === 'working' && (
            <Button className="h-12 w-full rounded-2xl px-5 sm:w-auto" disabled>
              <LoaderCircle className="animate-spin" /> Aguardando…
            </Button>
          )}
          {hasProblem && step !== 'unavailable' && (
            <Button
              className="h-12 w-full rounded-2xl sm:w-auto"
              variant="outline"
              onClick={enableNotifications}
            >
              Tentar novamente
            </Button>
          )}
          {(finished || hasProblem) && (
            <Button
              className="h-12 w-full rounded-2xl px-5 sm:w-auto"
              onClick={onComplete}
            >
              {completionLabel}
            </Button>
          )}
        </div>
      </dialog>
    </div>
  );
}
