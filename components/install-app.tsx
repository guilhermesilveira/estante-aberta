'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Check,
  Download,
  LoaderCircle,
  MoreVertical,
  Share,
  Smartphone,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type InstallReason = 'manual' | 'share' | 'loan';
type InstallStep = 'intro' | 'working' | 'instructions';

type InstallChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<InstallChoice | void>;
  userChoice: Promise<InstallChoice>;
}

type InstallAppContextValue = {
  isInstalled: boolean;
  offerInstall: (reason?: InstallReason) => void;
};

const AUTO_INVITE_KEY = 'estante-aberta:install-invite-shown';
const InstallAppContext = createContext<InstallAppContextValue | null>(null);

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorWithStandalone.standalone === true
  );
}

function isIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isIOSSafari() {
  return (
    isIOS() &&
    /safari/i.test(navigator.userAgent) &&
    !/(crios|fxios|edgios|opios)/i.test(navigator.userAgent)
  );
}

export function InstallAppProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<InstallReason>('manual');
  const [step, setStep] = useState<InstallStep>('intro');
  const primaryButton = useRef<HTMLButtonElement>(null);
  const autoInviteShown = useRef(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((registration) => registration.update())
        .catch(() => undefined);
    }

    function captureInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }

    function markInstalled() {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setOpen(false);
    }

    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener('appinstalled', markInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
      window.removeEventListener('appinstalled', markInstalled);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    primaryButton.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, step]);

  const offerInstall = useCallback((nextReason: InstallReason = 'manual') => {
    if (isStandalone()) {
      setIsInstalled(true);
      return;
    }

    if (nextReason !== 'manual') {
      if (autoInviteShown.current) return;
      try {
        if (window.localStorage.getItem(AUTO_INVITE_KEY)) return;
        window.localStorage.setItem(AUTO_INVITE_KEY, nextReason);
      } catch {
        // A sessão ainda evita repetição quando o navegador bloqueia storage.
      }
      autoInviteShown.current = true;
    }

    setReason(nextReason);
    setStep('intro');
    setOpen(true);
  }, []);

  async function install() {
    if (!deferredPrompt) {
      setStep('instructions');
      return;
    }

    const prompt = deferredPrompt;
    setDeferredPrompt(null);
    setStep('working');
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setIsInstalled(true);
      setOpen(false);
    } catch {
      setStep('instructions');
    }
  }

  const context = { isInstalled, offerInstall };
  const reasonText =
    reason === 'share'
      ? 'Assim, sua estante fica a um toque de distância para você acompanhar os próximos pedidos.'
      : reason === 'loan'
        ? 'Assim, você volta rapidamente à Estante Aberta para acompanhar os livros que pediu emprestados.'
        : 'Tenha a Estante Aberta na sua tela inicial e abra como um aplicativo, sem precisar procurar o site.';

  return (
    <InstallAppContext.Provider value={context}>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-[130] grid place-items-end bg-[#10261f]/70 p-3 backdrop-blur-sm sm:place-items-center sm:p-6"
          role="presentation"
        >
          <dialog
            open
            aria-describedby="install-app-description"
            aria-labelledby="install-app-title"
            aria-modal="true"
            className="relative m-0 w-full max-w-lg rounded-[28px] border-0 bg-card p-5 text-foreground shadow-[0_28px_90px_rgb(10_30_24/35%)] sm:p-7"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-[#e8f2ed] text-[#275b4b]">
              {step === 'instructions' ? (
                isIOS() ? (
                  <Share className="size-6" />
                ) : (
                  <MoreVertical className="size-6" />
                )
              ) : (
                <Smartphone className="size-6" />
              )}
            </span>

            <h2
              className="mt-4 font-heading text-3xl font-bold tracking-[-0.045em]"
              id="install-app-title"
            >
              {step === 'instructions'
                ? 'Instale pelo navegador'
                : 'Deseja instalar o aplicativo agora?'}
            </h2>

            <div
              className="mt-3 space-y-3 text-base leading-7 text-muted-foreground"
              id="install-app-description"
            >
              {step === 'intro' && (
                <>
                  <p>{reasonText}</p>
                  <p>
                    A instalação é gratuita e não muda sua conta nem seus
                    livros.
                  </p>
                </>
              )}
              {step === 'working' && (
                <p>Aguardando sua confirmação no navegador…</p>
              )}
              {step === 'instructions' && isIOSSafari() && (
                <p>
                  No Safari, toque em <strong>Compartilhar</strong> (o quadrado
                  com seta para cima) e depois em{' '}
                  <strong>Adicionar à Tela de Início</strong>.
                </p>
              )}
              {step === 'instructions' && isIOS() && !isIOSSafari() && (
                <p>
                  No iPhone ou iPad, abra esta página no Safari. Depois toque em{' '}
                  <strong>Compartilhar</strong> e em{' '}
                  <strong>Adicionar à Tela de Início</strong>.
                </p>
              )}
              {step === 'instructions' && !isIOS() && (
                <p>
                  Se o seu navegador oferecer instalação, abra o menu e escolha{' '}
                  <strong>Instalar aplicativo</strong> ou{' '}
                  <strong>Adicionar à tela inicial</strong>. Se essa opção não
                  aparecer, continue usando normalmente pelo navegador.
                </p>
              )}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {step === 'intro' && (
                <Button
                  className="h-12 rounded-2xl"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  Agora não
                </Button>
              )}
              {step === 'intro' && (
                <Button
                  ref={primaryButton}
                  className="h-12 rounded-2xl px-5"
                  onClick={install}
                >
                  <Download /> Instalar aplicativo
                </Button>
              )}
              {step === 'working' && (
                <Button className="h-12 rounded-2xl px-5" disabled>
                  <LoaderCircle className="animate-spin" /> Aguardando…
                </Button>
              )}
              {step === 'instructions' && (
                <Button
                  ref={primaryButton}
                  className="h-12 rounded-2xl px-5"
                  onClick={() => setOpen(false)}
                >
                  <Check /> Entendi
                </Button>
              )}
            </div>
          </dialog>
        </div>
      )}
    </InstallAppContext.Provider>
  );
}

export function useInstallApp() {
  const context = useContext(InstallAppContext);
  if (!context) {
    throw new Error('useInstallApp precisa de InstallAppProvider.');
  }
  return context;
}

export function InstallAppButton({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  const { isInstalled, offerInstall } = useInstallApp();
  if (isInstalled) return null;

  return (
    <Button
      className={cn(
        'install-app-button h-10 rounded-full px-3 text-xs sm:px-4 sm:text-sm',
        onDark &&
          'border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white',
        className,
      )}
      variant="outline"
      onClick={() => offerInstall('manual')}
    >
      <Download /> Instalar no celular
    </Button>
  );
}
