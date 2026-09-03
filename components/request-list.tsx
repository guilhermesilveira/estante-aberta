'use client';

import { useState } from 'react';
import {
  BookOpen,
  Check,
  Clock3,
  LoaderCircle,
  MessageCircle,
  PackageCheck,
  ShieldAlert,
  X,
} from 'lucide-react';
import Image from 'next/image';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import type { BookRequest } from '@/db/repository';

const statusLabel: Record<BookRequest['status'], string> = {
  pending: 'Novo pedido',
  accepted: 'Confirmado',
  declined: 'Não disponível',
  completed: 'Entregue',
};

export function RequestList({
  initialRequests,
}: {
  initialRequests: BookRequest[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [selectedByRequest, setSelectedByRequest] = useState<
    Record<string, string[]>
  >(() =>
    Object.fromEntries(
      initialRequests.map((request) => [
        request.id,
        request.books.map((book) => book.id),
      ]),
    ),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<Record<string, string>>({});

  function toggleBook(requestId: string, bookId: string) {
    setSelectedByRequest((current) => {
      const selected = current[requestId] ?? [];
      return {
        ...current,
        [requestId]: selected.includes(bookId)
          ? selected.filter((id) => id !== bookId)
          : [...selected, bookId],
      };
    });
  }

  async function updateStatus(
    requestId: string,
    status: BookRequest['status'],
    bookIds?: string[],
  ) {
    setBusy(requestId);
    setError((current) => ({ ...current, [requestId]: '' }));
    try {
      const response = await fetch(`/api/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, bookIds }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          payload.error || 'Não foi possível atualizar o pedido.',
        );
      setRequests((current) =>
        current.map((request) => {
          if (request.id !== requestId) return request;
          return {
            ...request,
            status,
            books:
              status === 'accepted' && bookIds
                ? request.books.filter((book) => bookIds.includes(book.id))
                : request.books,
          };
        }),
      );
    } catch (caught) {
      setError((current) => ({
        ...current,
        [requestId]:
          caught instanceof Error
            ? caught.message
            : 'Não foi possível atualizar o pedido.',
      }));
    } finally {
      setBusy(null);
    }
  }

  if (!requests.length) {
    return (
      <div className="rounded-[24px] border border-dashed bg-card p-7 text-center">
        <Clock3 className="mx-auto size-7 text-muted-foreground" />
        <p className="mt-3 font-semibold">Os pedidos vão aparecer aqui</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Depois que você compartilhar a estante.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-2xl bg-[#fff7dd] px-4 py-3 text-xs leading-5 text-[#6d561a]">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        O nome vem da conta, mas a Estante Aberta não confirma que uma pessoa é
        quem diz ser. Combine a entrega com cuidado.
      </p>
      {requests.map((request) => {
        const selected = selectedByRequest[request.id] ?? [];
        return (
          <article
            className="scroll-mt-5 rounded-[24px] border bg-card p-5 shadow-[0_10px_30px_rgb(44_43_37/6%)] target:border-[#387c67] target:ring-4 target:ring-[#387c67]/20"
            id={`pedido-${request.id}`}
            key={request.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading text-xl font-bold tracking-[-0.03em]">
                    {request.requesterName}
                  </h3>
                  <Badge
                    variant={
                      request.status === 'pending' ? 'default' : 'secondary'
                    }
                  >
                    {statusLabel[request.status]}
                  </Badge>
                </div>
                {request.requesterContact && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {request.requesterContact}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                  timeZone: 'America/Sao_Paulo',
                }).format(new Date(request.createdAt))}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {request.books.map((book, index) => {
                const isSelected = selected.includes(book.id);
                const className = `relative size-16 overflow-hidden rounded-xl border-2 bg-[#e8dfcd] transition ${request.status === 'pending' ? 'cursor-pointer hover:-translate-y-0.5' : ''} ${isSelected && request.status === 'pending' ? 'border-[#387c67] ring-2 ring-[#387c67]/25' : 'border-transparent'}`;
                const contents = (
                  <>
                    {book.photoBatchId ? (
                      <Image
                        fill
                        unoptimized
                        sizes="64px"
                        className="object-cover"
                        src={`/api/photos/${book.photoBatchId}`}
                        alt={`Livro ${index + 1} do pedido`}
                      />
                    ) : (
                      <span className="grid size-full place-items-center">
                        <BookOpen className="size-5" />
                      </span>
                    )}
                    {request.status === 'pending' && (
                      <span
                        className={`absolute right-1 top-1 grid size-5 place-items-center rounded-full ${isSelected ? 'bg-[#387c67] text-white' : 'bg-white/85 text-transparent'}`}
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </>
                );
                return request.status === 'pending' ? (
                  <button
                    className={className}
                    aria-label={`${isSelected ? 'Desmarcar' : 'Marcar'} livro ${index + 1}`}
                    aria-pressed={isSelected}
                    key={book.id}
                    type="button"
                    onClick={() => toggleBook(request.id, book.id)}
                  >
                    {contents}
                  </button>
                ) : (
                  <div
                    className={className}
                    key={book.id}
                    title={`Livro ${index + 1}`}
                  >
                    {contents}
                  </div>
                );
              })}
            </div>
            {request.note && (
              <p className="mt-4 border-l-2 border-[#f0be46] pl-3 text-sm italic text-muted-foreground">
                {request.note}
              </p>
            )}
            {request.requesterContact && (
              <a
                className={buttonVariants({
                  variant: 'ghost',
                  size: 'sm',
                  className: 'mt-3 h-9 rounded-xl',
                })}
                href={`https://wa.me/${request.requesterContact.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle /> Conversar no WhatsApp
              </a>
            )}
            {request.status === 'pending' && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  className="h-9 rounded-xl"
                  size="sm"
                  disabled={busy === request.id || selected.length === 0}
                  onClick={() => updateStatus(request.id, 'accepted', selected)}
                >
                  {busy === request.id ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Check />
                  )}{' '}
                  Confirmar {selected.length}
                </Button>
                <Button
                  className="h-9 rounded-xl"
                  size="sm"
                  variant="outline"
                  disabled={busy === request.id}
                  onClick={() => updateStatus(request.id, 'declined')}
                >
                  <X /> Não disponível
                </Button>
              </div>
            )}
            {request.status === 'pending' && (
              <p className="mt-2 text-xs text-muted-foreground">
                Todos começam selecionados. Desmarque o que não conseguir
                separar.
              </p>
            )}
            {error[request.id] && (
              <p
                className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                role="alert"
              >
                {error[request.id]}
              </p>
            )}
            {request.status === 'accepted' && (
              <Button
                className="mt-4 h-9 rounded-xl"
                size="sm"
                variant="outline"
                disabled={busy === request.id}
                onClick={() => updateStatus(request.id, 'completed')}
              >
                <PackageCheck /> Marcar como entregue
              </Button>
            )}
          </article>
        );
      })}
    </div>
  );
}
