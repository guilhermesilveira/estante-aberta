import {
  BookCheck,
  BookOpen,
  Clock3,
  Gift,
  Handshake,
  PackageCheck,
  X,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';

import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { Brand } from '@/components/brand';
import { TermsLink } from '@/components/terms-link';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { getRequesterRequest } from '@/db/repository';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Meu pedido — Estante Aberta',
  description: 'Acompanhe a confirmação dos livros que você pediu.',
  robots: { index: false, follow: false },
};

const statusContent = {
  pending: {
    label: 'Aguardando confirmação',
    title: 'Seu pedido foi enviado.',
    description:
      'A pessoa dona da estante ainda vai confirmar quais livros consegue separar.',
    icon: Clock3,
  },
  accepted: {
    label: 'Pedido confirmado',
    title: 'Seus livros serão entregues.',
    description:
      'Combine a retirada no local e no horário já definidos pelo seu grupo.',
    icon: BookCheck,
  },
  declined: {
    label: 'Não disponível',
    title: 'Os livros não puderam ser separados.',
    description:
      'Você pode voltar à estante para escolher outros livros disponíveis.',
    icon: X,
  },
  completed: {
    label: 'Entregue',
    title: 'Entrega concluída.',
    description: 'A pessoa dona da estante marcou este pedido como entregue.',
    icon: PackageCheck,
  },
} as const;

export default async function RequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireChatGPTUser(`/meus-pedidos/${id}`);
  const request = await getRequesterRequest(id, user.userId);
  if (!request) notFound();

  const content = statusContent[request.status];
  const StatusIcon = content.icon;
  const showBooks = request.status !== 'declined';
  const bookHeading =
    request.status === 'pending' ? 'Livros solicitados' : 'Livros confirmados';

  return (
    <main className="min-h-screen bg-[#f6f1e8] px-5 py-6 text-foreground sm:py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6">
          <Brand />
        </div>
        <section className="rounded-[30px] border bg-card p-5 shadow-[0_24px_80px_rgb(44_43_37/10%)] sm:p-8">
          <span className="grid size-14 place-items-center rounded-2xl bg-[#e8f2ed] text-[#275b4b]">
            <StatusIcon className="size-7" />
          </span>
          <Badge className="mt-5" variant="secondary">
            {content.label}
          </Badge>
          <h1 className="mt-3 font-heading text-4xl font-bold leading-tight tracking-[-0.055em]">
            {content.title}
          </h1>
          <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
            {content.description}
          </p>

          {request.status === 'accepted' && (
            <div className="mt-5 rounded-2xl bg-[#f4f7f5] px-4 py-3 text-sm leading-6">
              <strong>
                {request.confirmedCount}{' '}
                {request.confirmedCount === 1
                  ? 'livro confirmado'
                  : 'livros confirmados'}
              </strong>
              {request.unavailableCount > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  · {request.unavailableCount}{' '}
                  {request.unavailableCount === 1
                    ? 'não pôde ser separado'
                    : 'não puderam ser separados'}
                </span>
              )}
            </div>
          )}

          {showBooks && request.books.length > 0 && (
            <section className="mt-7">
              <h2 className="font-heading text-2xl font-bold tracking-[-0.035em]">
                {bookHeading}
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
                {request.books.map((book, index) => (
                  <div key={book.id}>
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#e8dfcd]">
                      {book.photoBatchId ? (
                        <Image
                          fill
                          unoptimized
                          sizes="120px"
                          className="object-cover"
                          src={`/api/photos/${book.photoBatchId}`}
                          alt={`Livro ${index + 1} do pedido`}
                        />
                      ) : (
                        <span className="grid size-full place-items-center text-[#587066]">
                          <BookOpen />
                        </span>
                      )}
                    </div>
                    <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                      {book.availability === 'donation' ? (
                        <Gift className="size-3.5" />
                      ) : (
                        <Handshake className="size-3.5" />
                      )}
                      {book.availability === 'donation'
                        ? 'Doação'
                        : 'Empréstimo'}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="mt-8 border-t pt-5">
            <p className="text-sm text-muted-foreground">
              Pedido na{' '}
              <strong className="text-foreground">{request.shelf.name}</strong>,
              de {request.shelf.ownerName}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Criado em{' '}
              {new Intl.DateTimeFormat('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: 'America/Sao_Paulo',
              }).format(new Date(request.createdAt))}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a
                className={buttonVariants({ variant: 'outline' })}
                href={`/e/${request.shelf.slug}`}
              >
                Voltar para a estante
              </a>
              <TermsLink className="text-sm text-foreground" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
