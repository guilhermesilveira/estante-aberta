'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  BookOpen,
  Check,
  Copy,
  MessageCircle,
  LayoutGrid,
  Table2,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import type { Book } from '@/db/repository';
import { requestAppInstall } from '@/lib/install-app';

function subscribeView(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}
function readView(): 'cards' | 'table' {
  try {
    return localStorage.getItem('estante-owner-view') === 'table'
      ? 'table'
      : 'cards';
  } catch {
    return 'cards';
  }
}

export function OwnerLibrary({
  initialBooks,
  shelfSlug,
}: {
  initialBooks: Book[];
  shelfSlug: string;
}) {
  const [books, setBooks] = useState(initialBooks);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [chosenView, setView] = useState<'cards' | 'table' | null>(null);
  const savedView = useSyncExternalStore(
    subscribeView,
    readView,
    () => 'cards',
  );
  const view = chosenView ?? savedView;

  function changeView(next: 'cards' | 'table') {
    setView(next);
    try {
      localStorage.setItem('estante-owner-view', next);
    } catch {
      // The current view still works without persistent storage.
    }
  }

  function statusLabel(book: Book) {
    return {
      available: 'Disponível',
      reserved: 'Reservado',
      loaned: 'Emprestado',
      given: 'Doado',
      removed: 'Removido',
    }[book.status];
  }

  const publicPath = `/e/${shelfSlug}`;
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
    requestAppInstall('share');
    window.setTimeout(() => setCopied(false), 1600);
  }

  function shareWhatsApp() {
    const text = `Abri minha Estante Aberta. Escolha os livros que você quiser: ${publicUrl}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    );
    requestAppInstall('share');
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

  function bookControls(book: Book) {
    return (
      <>
        <button
          type="button"
          role="switch"
          aria-checked={book.availability === 'donation'}
          aria-label={`Alternar entre empréstimo e doação: ${book.title || 'Livro fotografado'}`}
          className="group grid w-full cursor-pointer grid-cols-2 rounded-xl border border-transparent bg-[#f6f1e8] p-1 text-sm font-semibold transition hover:border-[#387c67]/35 hover:shadow-[0_5px_18px_rgb(39_91_75/13%)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#387c67]/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent disabled:hover:shadow-none"
          disabled={busy === book.id || book.status !== 'available'}
          onClick={() =>
            patchBook(book.id, {
              availability: book.availability === 'loan' ? 'donation' : 'loan',
            })
          }
          title={
            book.status === 'available'
              ? 'Clique para alterar entre empréstimo e doação'
              : undefined
          }
        >
          <span
            className={`rounded-lg break-words px-1 py-2 text-xs sm:px-2 sm:text-sm ${book.availability === 'loan' ? 'bg-white text-[#275b4b] shadow-sm' : 'text-muted-foreground'}`}
          >
            Empréstimo
          </span>
          <span
            className={`rounded-lg break-words px-1 py-2 text-xs sm:px-2 sm:text-sm ${book.availability === 'donation' ? 'bg-white text-[#a74630] shadow-sm' : 'text-muted-foreground'}`}
          >
            Doação
          </span>
        </button>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {book.status === 'loaned' && (
            <Button
              className="col-span-2 h-auto min-h-10 min-w-0 whitespace-normal rounded-xl px-2 py-2 text-xs sm:col-span-1 sm:text-sm"
              size="sm"
              variant="outline"
              disabled={busy === book.id}
              onClick={() => patchBook(book.id, { status: 'available' })}
            >
              <RotateCcw /> Marcar devolvido
            </Button>
          )}
          {book.status === 'reserved' && (
            <Button
              className="col-span-2 h-auto min-h-10 min-w-0 whitespace-normal rounded-xl px-2 py-2 text-xs sm:col-span-1 sm:text-sm"
              size="sm"
              variant="outline"
              disabled={busy === book.id}
              onClick={() => patchBook(book.id, { status: 'available' })}
            >
              <RotateCcw /> Liberar reserva
            </Button>
          )}
          <Button
            className="col-span-2 h-auto min-h-10 min-w-0 whitespace-normal px-2 py-2 text-xs text-muted-foreground sm:col-span-1 sm:text-sm"
            size="sm"
            variant="ghost"
            disabled={busy === book.id}
            onClick={() => removeBook(book.id)}
          >
            <Trash2 /> Remover
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] bg-[#183d33] p-4 text-white shadow-[0_20px_60px_rgb(24_61_51/18%)] sm:rounded-[28px] sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#b9d8ca]">
              Link da sua estante
            </p>
            <h2 className="mt-1 font-heading text-[1.4rem] font-bold leading-tight tracking-[-0.04em] sm:text-2xl">
              Sua estante está pronta para circular
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">
              Seus colegas abrem o link, escolhem os livros que quiserem e
              enviam o pedido para você confirmar.
            </p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button
              className="h-11 min-w-0 rounded-xl bg-[#f0be46] px-3 text-[#2f401e] hover:bg-[#f0be46]/90 sm:px-4"
              onClick={shareWhatsApp}
            >
              <MessageCircle /> WhatsApp
            </Button>
            <Button
              className="h-11 min-w-0 rounded-xl border-white/25 bg-white/10 px-3 text-white hover:bg-white/20 sm:px-4"
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
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#d35c41]">
              Seus livros
            </p>
            <h2 className="mt-1 font-heading text-[1.75rem] font-bold tracking-[-0.045em] sm:text-3xl">
              {books.length} {books.length === 1 ? 'livro' : 'livros'} na
              estante
            </h2>
          </div>
          <fieldset
            aria-label="Visualização dos livros"
            className="flex gap-1 rounded-xl border bg-card p-1"
          >
            <Button
              type="button"
              size="sm"
              variant={view === 'cards' ? 'default' : 'ghost'}
              aria-pressed={view === 'cards'}
              aria-controls="owner-books"
              onClick={() => changeView('cards')}
            >
              <LayoutGrid aria-hidden="true" /> Cards
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === 'table' ? 'default' : 'ghost'}
              aria-pressed={view === 'table'}
              aria-controls="owner-books"
              onClick={() => changeView('table')}
            >
              <Table2 aria-hidden="true" /> Tabela
            </Button>
          </fieldset>
        </div>
        <div id="owner-books">
          {books.length === 0 ? (
            <p className="rounded-2xl border bg-card p-6 text-muted-foreground">
              Sua estante ainda não tem livros. Adicione suas primeiras fotos
              acima.
            </p>
          ) : view === 'table' ? (
            <div className="overflow-hidden rounded-2xl border bg-card">
              <table className="w-full table-fixed text-left text-sm">
                <caption className="sr-only">
                  Livros da sua estante, modalidade e ações
                </caption>
                <thead className="bg-[#f6f1e8] text-xs text-muted-foreground">
                  <tr>
                    <th
                      scope="col"
                      className="w-[44%] px-3 py-3 sm:w-1/2 sm:px-4"
                    >
                      Livro e situação
                    </th>
                    <th scope="col" className="px-3 py-3 sm:px-4">
                      Modalidade e ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {books.map((book) => (
                    <tr key={book.id}>
                      <th
                        scope="row"
                        aria-label={book.title || 'Livro fotografado'}
                        className="p-3 align-top font-normal sm:p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                          <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-[#e8dfcd]">
                            {book.photoBatchId ? (
                              <Image
                                fill
                                unoptimized
                                sizes="48px"
                                className="object-contain"
                                src={`/api/photos/${book.photoBatchId}`}
                                alt=""
                              />
                            ) : (
                              <BookOpen
                                aria-hidden="true"
                                className="m-3 size-6 text-[#387c67]"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="break-words font-semibold">
                              {book.title || 'Livro fotografado'}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {statusLabel(book)}
                            </p>
                          </div>
                        </div>
                      </th>
                      <td className="p-3 align-top sm:p-4">
                        <div className="max-w-sm">{bookControls(book)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
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
                    className="overflow-hidden rounded-[22px] border bg-card shadow-[0_12px_38px_rgb(44_43_37/7%)] sm:rounded-[24px]"
                    key={book.id}
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-[#e8dfcd] sm:aspect-[4/3]">
                      {book.photoBatchId ? (
                        <Image
                          fill
                          unoptimized
                          sizes="(max-width: 640px) 100vw, 33vw"
                          className="object-contain"
                          src={`/api/photos/${book.photoBatchId}`}
                          alt={book.title || 'Foto do livro'}
                        />
                      ) : (
                        <div className="grid size-full place-items-center bg-[#387c67] text-white">
                          <BookOpen className="size-12" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      {book.title && book.title !== 'Livro fotografado' && (
                        <h3 className="mb-3 font-semibold">{book.title}</h3>
                      )}
                      {statusLabel && (
                        <p className="mb-3 text-xs font-semibold text-muted-foreground">
                          {statusLabel}
                        </p>
                      )}
                      {bookControls(book)}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
