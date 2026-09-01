'use client';

import { useState } from 'react';
import { BookOpen, Check, Clock3, LoaderCircle, MessageCircle, PackageCheck, X } from 'lucide-react';
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

export function RequestList({ initialRequests }: { initialRequests: BookRequest[] }) {
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState<string | null>(null);

  async function updateStatus(requestId: string, status: BookRequest['status']) {
    setBusy(requestId);
    try {
      const response = await fetch(`/api/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error();
      setRequests((current) => current.map((request) => (request.id === requestId ? { ...request, status } : request)));
    } finally {
      setBusy(null);
    }
  }

  if (!requests.length) {
    return (
      <div className="rounded-[24px] border border-dashed bg-card p-7 text-center">
        <Clock3 className="mx-auto size-7 text-muted-foreground" />
        <p className="mt-3 font-semibold">Os pedidos vão aparecer aqui</p>
        <p className="mt-1 text-sm text-muted-foreground">Depois que você compartilhar a estante.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <article className="rounded-[24px] border bg-card p-5 shadow-[0_10px_30px_rgb(44_43_37/6%)]" key={request.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-xl font-bold tracking-[-0.03em]">{request.requesterName}</h3>
                <Badge variant={request.status === 'pending' ? 'default' : 'secondary'}>{statusLabel[request.status]}</Badge>
              </div>
              {request.requesterContact && <p className="mt-1 text-sm text-muted-foreground">{request.requesterContact}</p>}
            </div>
            <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(request.createdAt))}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {request.books.map((book, index) => (
              <div className="relative size-16 overflow-hidden rounded-xl bg-[#e8dfcd]" key={book.id} title={`Livro ${index + 1}`}>
                {book.photoBatchId ? (
                  <Image fill unoptimized sizes="64px" className="object-cover" src={`/api/photos/${book.photoBatchId}`} alt={`Livro ${index + 1} do pedido`} />
                ) : (
                  <span className="grid size-full place-items-center"><BookOpen className="size-5" /></span>
                )}
              </div>
            ))}
          </div>
          {request.note && <p className="mt-4 border-l-2 border-[#f0be46] pl-3 text-sm italic text-muted-foreground">{request.note}</p>}
          {request.status === 'pending' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button className="h-9 rounded-xl" size="sm" disabled={busy === request.id} onClick={() => updateStatus(request.id, 'accepted')}>
                {busy === request.id ? <LoaderCircle className="animate-spin" /> : <Check />} Confirmar
              </Button>
              <Button className="h-9 rounded-xl" size="sm" variant="outline" disabled={busy === request.id} onClick={() => updateStatus(request.id, 'declined')}>
                <X /> Não disponível
              </Button>
              {request.requesterContact && (
                <a className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-9 rounded-xl' })} href={`https://wa.me/${request.requesterContact.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                  <MessageCircle /> Conversar
                </a>
              )}
            </div>
          )}
          {request.status === 'accepted' && (
            <Button className="mt-4 h-9 rounded-xl" size="sm" variant="outline" disabled={busy === request.id} onClick={() => updateStatus(request.id, 'completed')}>
              <PackageCheck /> Marcar como entregue
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}
