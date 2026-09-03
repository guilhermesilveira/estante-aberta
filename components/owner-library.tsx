'use client';

import { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  MessageCircle,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';

import { useInstallApp } from '@/components/install-app';
import { Button } from '@/components/ui/button';
import type { Book, Shelf } from '@/db/repository';

export function OwnerLibrary({
  initialBooks,
  shelf,
}: {
  initialBooks: Book[];
  shelf: Shelf;
}) {
  const [books, setBooks] = useState(initialBooks);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { offerInstall } = useInstallApp();

  const publicPath = `/e/${shelf.slug}`;
  const publicUrl = useMemo(
    () =>
      typeof window === 'undefined'
        ? publicPath
        : new URL(publicPath, window.location.origin).toString(),
    [publicPath],
  );

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    offerInstall('share');
    window.setTimeout(() => setCopied(false), 1600);
  }

  function shareWhatsApp() {
    const text = `Abri minha Estante Aberta. Escolha os livros que você quiser: ${publicUrl}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    );
    offerInstall('share');
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
      setBooks((current) =>
        current.map((book) =>
          book.id === bookId ? { ...book, ...patch } : book,
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  async function removeBook(bookId: string) {
    if (!window.confirm('Remover este livro da estante?')) return;
    setBusy(bookId);
    try {
      const response = await fetch(`/api/books/${bookId}`, {
        method: 'DELETE',
      });
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
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#b9d8ca]">
              Link da sua estante
            </p>
            <h2 className="mt-1 font-heading text-2xl font-bold tracking-[-0.04em]">
              Sua estante está pronta para circular
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
              Seus colegas abrem o link, escolhem os livros que quiserem e
              enviam o pedido para você confirmar.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              className="h-11 rounded-xl bg-[#f0be46] px-4 text-[#2f401e] hover:bg-[#f0be46]/90"
              onClick={shareWhatsApp}
            >
              <MessageCircle /> WhatsApp
            </Button>
            <Button
              className="h-11 rounded-xl border-white/25 bg-white/10 px-4 text-white hover:bg-white/20"
              variant="outline"
              onClick={copyLink}
            >
              {copied ? <Check /> : <Copy />}{' '}
              {copied ? 'Copiado' : 'Copiar link'}
            </Button>
          </div>
        </div>
        <p className="mt-5 flex max-w-3xl items-start gap-2 border-t border-white/15 pt-4 text-xs leading-5 text-white/65">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          Use esta estante com pessoas que você já conhece. Em cada pedido, você
          verá somente o nome da conta da pessoa. Entregue os livros no local e
          no horário combinados pelo grupo.
        </p>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#d35c41]">
              Seus livros
            </p>
            <h2 className="mt-1 font-heading text-3xl font-bold tracking-[-0.045em]">
              {books.length} {books.length === 1 ? 'livro' : 'livros'} na
              estante
            </h2>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {books.map((book) => {
            const statusLabel = {
              available: '',
              reserved: 'Reservado',
              loaned: 'Emprestado',
              given: 'Doado',
              removed: 'Removido',
            }[book.status];
            return (
              <article
                className="overflow-hidden rounded-[24px] border bg-card shadow-[0_12px_38px_rgb(44_43_37/7%)]"
                key={book.id}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[#e8dfcd]">
                  {book.photoBatchId ? (
                    <Image
                      fill
                      unoptimized
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-contain"
                      src={`/api/photos/${book.photoBatchId}`}
                      alt="Foto do livro"
                    />
                  ) : (
                    <div className="grid size-full place-items-center bg-[#387c67] text-white">
                      <BookOpen className="size-12" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  {statusLabel && (
                    <p className="mb-3 text-xs font-semibold text-muted-foreground">
                      {statusLabel}
                    </p>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={book.availability === 'donation'}
                    aria-label="Alternar entre empréstimo e doação"
                    className="group grid w-full cursor-pointer grid-cols-2 rounded-xl border border-transparent bg-[#f6f1e8] p-1 text-sm font-semibold transition hover:border-[#387c67]/35 hover:shadow-[0_5px_18px_rgb(39_91_75/13%)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#387c67]/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent disabled:hover:shadow-none"
                    disabled={busy === book.id || book.status !== 'available'}
                    onClick={() =>
                      patchBook(book.id, {
                        availability:
                          book.availability === 'loan' ? 'donation' : 'loan',
                      })
                    }
                    title={
                      book.status === 'available'
                        ? 'Clique para alterar entre empréstimo e doação'
                        : undefined
                    }
                  >
                    <span
                      className={`rounded-lg px-2 py-2 ${book.availability === 'loan' ? 'bg-white text-[#275b4b] shadow-sm' : 'text-muted-foreground'}`}
                    >
                      Empréstimo
                    </span>
                    <span
                      className={`rounded-lg px-2 py-2 ${book.availability === 'donation' ? 'bg-white text-[#a74630] shadow-sm' : 'text-muted-foreground'}`}
                    >
                      Doação
                    </span>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {book.status === 'loaned' && (
                      <Button
                        className="h-9 rounded-xl"
                        size="sm"
                        variant="outline"
                        disabled={busy === book.id}
                        onClick={() =>
                          patchBook(book.id, { status: 'available' })
                        }
                      >
                        <RotateCcw /> Marcar devolvido
                      </Button>
                    )}
                    {book.status === 'reserved' && (
                      <Button
                        className="h-9 rounded-xl"
                        size="sm"
                        variant="outline"
                        disabled={busy === book.id}
                        onClick={() =>
                          patchBook(book.id, { status: 'available' })
                        }
                      >
                        <RotateCcw /> Liberar reserva
                      </Button>
                    )}
                    <Button
                      className="h-9 text-muted-foreground"
                      size="sm"
                      variant="ghost"
                      disabled={busy === book.id}
                      onClick={() => removeBook(book.id)}
                    >
                      <Trash2 /> Remover
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
