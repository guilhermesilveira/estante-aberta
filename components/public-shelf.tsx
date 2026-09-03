'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  BookCheck,
  BookOpen,
  Check,
  Gift,
  Handshake,
  LoaderCircle,
  Send,
  ShieldAlert,
  ShoppingBag,
  X,
} from 'lucide-react';
import Image from 'next/image';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HardLink } from '@/components/hard-link';
import type { Book, Shelf } from '@/db/repository';

export function PublicShelf({
  books,
  shelf,
  viewerName,
}: {
  books: Book[];
  shelf: Shelf;
  viewerName: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successCode, setSuccessCode] = useState('');

  function toggle(bookId: string) {
    setError('');
    setSelected((current) => {
      if (current.includes(bookId))
        return current.filter((id) => id !== bookId);
      return [...current, bookId];
    });
  }

  async function submitRequest(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: shelf.slug,
          bookIds: selected,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        code?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || 'Não foi possível enviar.');
      setSuccessCode(payload.code ?? 'OK');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Não foi possível enviar.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (successCode) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f1e8] px-5 py-10">
        <section className="w-full max-w-lg rounded-[32px] border bg-card p-7 text-center shadow-[0_24px_80px_rgb(44_43_37/12%)] sm:p-10">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#e8f2ed] text-[#275b4b]">
            <BookCheck className="size-8" />
          </span>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-[#d35c41]">
            Pedido {successCode}
          </p>
          <h1 className="mt-2 font-heading text-4xl font-bold leading-tight tracking-[-0.055em]">
            Pedido efetuado.
          </h1>
          <p className="mx-auto mt-4 max-w-sm leading-7 text-muted-foreground">
            Sua sacola de livros foi enviada. {shelf.ownerName} vai confirmar
            quais livros poderá separar.
          </p>
          <p className="mx-auto mt-4 max-w-sm text-xs leading-5 text-muted-foreground">
            A entrega acontece no local e no horário já combinados pelo grupo.
          </p>
          <Button
            className="mt-7 h-11 rounded-xl"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Voltar para a estante
          </Button>
        </section>
      </main>
    );
  }

  if (showConfirmation) {
    const chosenBooks = books.filter((book) => selected.includes(book.id));
    return (
      <main className="min-h-screen bg-[#f6f1e8] px-5 py-6 sm:py-10">
        <section className="mx-auto w-full max-w-2xl rounded-[30px] border bg-card p-5 shadow-[0_24px_80px_rgb(44_43_37/10%)] sm:p-8">
          <Button
            className="-ml-2"
            variant="ghost"
            onClick={() => setShowConfirmation(false)}
          >
            <ArrowLeft /> Voltar aos livros
          </Button>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-[#d35c41]">
            Pedir livros
          </p>
          <h1 className="mt-1 font-heading text-4xl font-bold tracking-[-0.055em]">
            Confirme o pedido
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O pedido será enviado em nome de{' '}
            <strong className="text-foreground">{viewerName}</strong>. Esse nome
            vem da sua conta e não pode ser alterado aqui.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {chosenBooks.map((book, index) => (
              <button
                className="group relative aspect-square overflow-hidden rounded-2xl bg-[#e8dfcd]"
                aria-label={`Remover livro ${index + 1} da escolha`}
                key={book.id}
                type="button"
                onClick={() => toggle(book.id)}
              >
                {book.photoBatchId ? (
                  <Image
                    fill
                    unoptimized
                    sizes="120px"
                    className="object-cover"
                    src={`/api/photos/${book.photoBatchId}`}
                    alt="Foto do livro escolhido"
                  />
                ) : (
                  <span className="grid size-full place-items-center">
                    <BookOpen />
                  </span>
                )}
                <span className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/65 text-white">
                  <X className="size-3.5" />
                </span>
              </button>
            ))}
          </div>
          <form className="mt-6 space-y-4" onSubmit={submitRequest}>
            <p className="flex items-start gap-2 rounded-xl bg-[#fff7dd] px-4 py-3 text-xs leading-5 text-[#6d561a]">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              Use esta estante apenas para trocas entre pessoas que você já
              conhece. A entrega acontece no local e no horário já combinados
              pelo grupo.
            </p>
            {error && (
              <p
                className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}
            <Button
              className="h-12 w-full rounded-2xl text-base"
              type="submit"
              disabled={busy || !selected.length}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Send />}{' '}
              {busy ? 'Enviando…' : 'Confirmar pedido'}
            </Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              A pessoa dona da estante ainda escolherá quais livros consegue
              separar.
            </p>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-28 text-foreground">
      <header className="relative overflow-hidden bg-[#183d33] px-5 pb-14 pt-8 text-white sm:pb-20 sm:pt-12">
        <div className="absolute -right-16 -top-28 size-72 rounded-full bg-[#f0be46]/25 blur-2xl" />
        <div className="absolute -bottom-40 -left-20 size-80 rounded-full bg-[#ef6d4e]/25 blur-3xl" />
        <div className="relative mx-auto max-w-5xl">
          <HardLink
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white"
            href="/"
          >
            <span className="grid size-8 place-items-center rounded-xl bg-white/10">
              <ShoppingBag className="size-4" />
            </span>
            Estante Aberta
          </HardLink>
          <div className="mt-10 max-w-3xl">
            <h1 className="font-heading text-[clamp(2.8rem,9vw,5.4rem)] font-bold leading-[0.95] tracking-[-0.07em]">
              {shelf.name}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-white/70">
              {shelf.intro}
            </p>
            <p className="mt-5 flex max-w-xl items-start gap-2 text-xs leading-5 text-white/60">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              Esta estante é para pessoas que já se conhecem. A entrega acontece
              no local e no horário combinados pelo grupo.
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto -mt-6 w-full max-w-5xl px-5 sm:-mt-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 shadow-[0_12px_38px_rgb(44_43_37/8%)]">
          <p className="text-sm font-semibold">Escolha quantos livros quiser</p>
          <p className="text-sm text-muted-foreground">
            {books.length} {books.length === 1 ? 'livro' : 'livros'}
          </p>
        </div>
        {books.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {books.map((book, index) => {
              const isSelected = selected.includes(book.id);
              return (
                <button
                  type="button"
                  aria-pressed={isSelected}
                  className={`group overflow-hidden rounded-[22px] border bg-card text-left shadow-[0_10px_30px_rgb(44_43_37/7%)] transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#387c67]/25 ${isSelected ? 'border-[#387c67] ring-2 ring-[#387c67]' : 'hover:-translate-y-0.5 hover:border-[#387c67]/40'}`}
                  key={book.id}
                  onClick={() => toggle(book.id)}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#e8dfcd]">
                    {book.photoBatchId ? (
                      <Image
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="object-contain transition duration-300 group-hover:scale-[1.03]"
                        src={`/api/photos/${book.photoBatchId}`}
                        alt="Foto do livro"
                      />
                    ) : (
                      <div
                        className={`grid size-full place-items-center ${['bg-[#ef6d4e]', 'bg-[#e2b63d]', 'bg-[#387c67]', 'bg-[#5c7195]'][index % 4]} text-white`}
                      >
                        <BookOpen className="size-9" />
                      </div>
                    )}
                    <span
                      className={`absolute right-2 top-2 grid size-7 place-items-center rounded-full border-2 ${isSelected ? 'border-white bg-[#387c67] text-white' : 'border-white bg-white/85 text-transparent'}`}
                    >
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                  </div>
                  <div className="p-3 sm:p-4">
                    <Badge
                      className={
                        book.availability === 'donation'
                          ? 'bg-[#fff0eb] text-[#a74630]'
                          : 'bg-[#e8f2ed] text-[#275b4b]'
                      }
                      variant="secondary"
                    >
                      {book.availability === 'donation' ? (
                        <Gift />
                      ) : (
                        <Handshake />
                      )}
                      {book.availability === 'donation'
                        ? 'Doação'
                        : 'Empréstimo'}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed bg-card p-10 text-center">
            <p className="font-heading text-2xl font-bold">
              A estante está vazia agora
            </p>
            <p className="mt-2 text-muted-foreground">
              Volte depois para ver as novidades desta estante.
            </p>
          </div>
        )}
        {error && (
          <p
            className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-center text-sm font-medium text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </section>

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 p-3 backdrop-blur sm:p-4">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-heading text-xl font-bold tracking-[-0.03em]">
                {selected.length}{' '}
                {selected.length === 1 ? 'selecionado' : 'selecionados'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                na sua sacola de livros
              </p>
            </div>
            <Button
              className="h-12 rounded-2xl px-5 text-base"
              onClick={() => setShowConfirmation(true)}
            >
              Pedir <Send />
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
