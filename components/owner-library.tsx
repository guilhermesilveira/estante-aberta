'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Gift, Handshake, LoaderCircle, MessageCircle, PackageCheck, Trash2 } from 'lucide-react';
import Image from 'next/image';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Book, Shelf } from '@/db/repository';

export function OwnerLibrary({ initialBooks, shelf }: { initialBooks: Book[]; shelf: Shelf }) {
  const [books, setBooks] = useState(initialBooks);
  const [published, setPublished] = useState(shelf.published);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const publicPath = `/e/${shelf.slug}`;
  const publicUrl = useMemo(
    () => (typeof window === 'undefined' ? publicPath : new URL(publicPath, window.location.origin).toString()),
    [publicPath],
  );

  async function publish() {
    setBusy('publish');
    try {
      const response = await fetch('/api/shelf', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ published: true }),
      });
      if (!response.ok) throw new Error();
      setPublished(true);
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function shareWhatsApp() {
    const text = `Abri minha Estante Aberta. Escolha até 8 livros para eu levar no nosso próximo encontro: ${publicUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  async function patchBook(bookId: string, patch: Partial<Book>) {
    setBusy(bookId);
    try {
      const response = await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error();
      setBooks((current) => current.map((book) => (book.id === bookId ? { ...book, ...patch } : book)));
    } finally {
      setBusy(null);
    }
  }

  async function removeBook(bookId: string) {
    if (!window.confirm('Remover este livro da estante?')) return;
    setBusy(bookId);
    try {
      const response = await fetch(`/api/books/${bookId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error();
      setBooks((current) => current.filter((book) => book.id !== bookId));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] bg-[#183d33] p-5 text-white shadow-[0_20px_60px_rgb(24_61_51/18%)] sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#b9d8ca]">Link da sua estante</p>
            <h2 className="mt-1 font-heading text-2xl font-bold tracking-[-0.04em]">
              {published ? 'Sua estante está pronta para circular' : 'Publique quando estiver pronta'}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
              Seus colegas abrem o link, escolhem até oito livros e enviam o pedido para você confirmar.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {!published ? (
              <Button className="h-11 rounded-xl bg-[#f0be46] px-4 text-[#2f401e] hover:bg-[#f0be46]/90" disabled={!books.length || busy === 'publish'} onClick={publish}>
                {busy === 'publish' ? <LoaderCircle className="animate-spin" /> : <ExternalLink />}
                Publicar link
              </Button>
            ) : (
              <>
                <Button className="h-11 rounded-xl bg-[#f0be46] px-4 text-[#2f401e] hover:bg-[#f0be46]/90" onClick={shareWhatsApp}>
                  <MessageCircle /> WhatsApp
                </Button>
                <Button className="h-11 rounded-xl border-white/25 bg-white/10 px-4 text-white hover:bg-white/20" variant="outline" onClick={copyLink}>
                  {copied ? <Check /> : <Copy />} {copied ? 'Copiado' : 'Copiar link'}
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#d35c41]">Seus livros</p>
            <h2 className="mt-1 font-heading text-3xl font-bold tracking-[-0.045em]">
              {books.length} {books.length === 1 ? 'livro' : 'livros'} na estante
            </h2>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {books.map((book, index) => {
            const unavailable = book.status !== 'available';
            return (
              <article className={`overflow-hidden rounded-[24px] border bg-card shadow-[0_12px_38px_rgb(44_43_37/7%)] ${unavailable ? 'opacity-70' : ''}`} key={book.id}>
                <div className="relative aspect-[16/9] overflow-hidden bg-[#e8dfcd]">
                  {book.photoBatchId ? (
                    <Image fill unoptimized sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" src={`/api/photos/${book.photoBatchId}`} alt={`Foto com ${book.title}`} />
                  ) : (
                    <div className={`grid size-full place-items-center ${['bg-[#ef6d4e]', 'bg-[#e2b63d]', 'bg-[#387c67]'][index % 3]} p-6 text-white`}>
                      <p className="max-w-56 text-center font-heading text-2xl font-bold leading-tight">{book.title}</p>
                    </div>
                  )}
                  <Badge className="absolute left-3 top-3 bg-white/90 text-[#183d33] shadow-sm" variant="secondary">
                    {book.availability === 'donation' ? <Gift /> : <Handshake />}
                    {book.availability === 'donation' ? 'Doação' : 'Empréstimo'}
                  </Badge>
                </div>
                <div className="p-4">
                  <h3 className="font-heading text-xl font-bold leading-tight tracking-[-0.03em]">{book.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{book.author || 'Autor não informado'}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button className="h-9 rounded-xl" size="sm" variant="outline" disabled={busy === book.id} onClick={() => patchBook(book.id, { availability: book.availability === 'loan' ? 'donation' : 'loan' })}>
                      {book.availability === 'loan' ? <Gift /> : <Handshake />}
                      Mudar para {book.availability === 'loan' ? 'doação' : 'empréstimo'}
                    </Button>
                    <Button className="h-9 rounded-xl" size="sm" variant="outline" disabled={busy === book.id} onClick={() => patchBook(book.id, { status: unavailable ? 'available' : book.availability === 'donation' ? 'given' : 'loaned' })}>
                      <PackageCheck /> {unavailable ? 'Disponibilizar' : 'Marcar entregue'}
                    </Button>
                  </div>
                  <Button className="mt-2 h-8 px-2 text-muted-foreground" size="sm" variant="ghost" disabled={busy === book.id} onClick={() => removeBook(book.id)}>
                    <Trash2 /> Remover
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
