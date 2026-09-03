import { Clock3, Library, LogOut } from 'lucide-react';
import { redirect } from 'next/navigation';

import { requireChatGPTUser, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import { Brand } from '@/components/brand';
import { BookUploader } from '@/components/book-uploader';
import { InstallAppButton } from '@/components/install-app';
import { OwnerLibrary } from '@/components/owner-library';
import { RequestList } from '@/components/request-list';
import { TermsLink } from '@/components/terms-link';
import { buttonVariants } from '@/components/ui/button';
import {
  getOrCreateProfileName,
  getOrCreateShelf,
  getOwnerBooks,
  getOwnerRequests,
  sanitizeOwnerPhotos,
} from '@/db/repository';

export const dynamic = 'force-dynamic';

export default async function MyShelfPage() {
  const user = await requireChatGPTUser('/minha-estante');
  const profileName = await getOrCreateProfileName(user);
  if (!profileName) {
    redirect('/cadastro?return_to=%2Fminha-estante');
  }
  const shelf = await getOrCreateShelf(user, profileName);
  await sanitizeOwnerPhotos(user.userId);
  const [books, requests] = await Promise.all([
    getOwnerBooks(user.userId),
    getOwnerRequests(shelf.id),
  ]);
  const pendingRequests = requests.filter(
    (request) => request.status === 'pending',
  ).length;

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-8 sm:py-4">
          <div className="sm:hidden">
            <Brand compact />
          </div>
          <div className="hidden sm:block">
            <Brand />
          </div>
          <div className="flex items-center gap-2">
            <InstallAppButton />
            <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:block">
              {profileName}
            </span>
            <a
              aria-label="Sair da conta"
              className={buttonVariants({ variant: 'ghost', size: 'icon' })}
              href={chatGPTSignOutPath('/')}
              target="_top"
            >
              <LogOut />
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-8 sm:py-10">
        <section className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#d35c41]">
              Sua conta
            </p>
            <h1 className="mt-1 font-heading text-[2.5rem] font-bold leading-none tracking-[-0.06em] sm:mt-2 sm:text-[4.6rem]">
              Minha estante
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Fotografe um livro e escolha entre doação ou empréstimo.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            <div className="min-w-0 rounded-2xl border bg-card px-3 py-3 sm:px-4">
              <Library className="size-4 text-[#387c67]" />
              <p className="mt-2 font-heading text-2xl font-bold">
                {books.length}
              </p>
              <p className="text-xs text-muted-foreground">livros</p>
            </div>
            <div className="min-w-0 rounded-2xl border bg-card px-3 py-3 sm:px-4">
              <Clock3 className="size-4 text-[#d35c41]" />
              <p className="mt-2 font-heading text-2xl font-bold">
                {pendingRequests}
              </p>
              <p className="text-xs text-muted-foreground">pedidos novos</p>
            </div>
          </div>
        </section>

        <BookUploader defaultOpen={books.length === 0} />
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Ao disponibilizar livros, use somente o local de troca do seu grupo.{' '}
          <TermsLink className="text-foreground" />
        </p>

        {books.length > 0 && (
          <div className="mt-8">
            <OwnerLibrary initialBooks={books} shelfSlug={shelf.slug} />
          </div>
        )}

        <section className="mt-8 sm:mt-10">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#d35c41]">
              Organizar pedidos
            </p>
            <h2 className="mt-1 font-heading text-[1.75rem] font-bold tracking-[-0.045em] sm:text-3xl">
              Pedidos recebidos
            </h2>
          </div>
          <RequestList initialRequests={requests} />
        </section>
      </div>
    </main>
  );
}
