'use client';

import { useRef, useState } from 'react';
import { BookPlus, Camera, Check, ImagePlus, LoaderCircle, Plus, Trash2, X } from 'lucide-react';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type DraftBook = {
  localId: string;
  title: string;
  author: string;
  availability: 'loan' | 'donation';
};

function blankBook(): DraftBook {
  return {
    localId: crypto.randomUUID(),
    title: '',
    author: '',
    availability: 'loan',
  };
}

export function BookUploader({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftBook[]>([]);
  const [phase, setPhase] = useState<'pick' | 'review' | 'saving'>('pick');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setDrafts([]);
    setError('');
    setPhase('pick');
  }

  function choosePhoto(nextFile: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
  }

  function continueToBooks() {
    setDrafts(Array.from({ length: 8 }, blankBook));
    setPhase('review');
    setError('');
  }

  function updateDraft(id: string, patch: Partial<DraftBook>) {
    setDrafts((current) => current.map((book) => (book.localId === id ? { ...book, ...patch } : book)));
  }

  async function saveBooks() {
    const books = drafts
      .map((book) => ({
        title: book.title.trim(),
        author: book.author.trim(),
        availability: book.availability,
      }))
      .filter((book) => book.title);
    if (!books.length) {
      setError('Cadastre pelo menos um título.');
      return;
    }
    setPhase('saving');
    setError('');

    const formData = new FormData();
    if (file) formData.set('photo', file);
    formData.set('books', JSON.stringify(books));

    try {
      const response = await fetch('/api/books', { method: 'POST', body: formData });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.');
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.');
      setPhase('review');
    }
  }

  if (!open) {
    return (
      <Button className="h-12 rounded-2xl px-5" onClick={() => setOpen(true)}>
        <Camera className="size-5" data-icon="inline-start" />
        Fotografar livros
      </Button>
    );
  }

  return (
    <section className="rounded-[28px] border border-[#275b4b]/15 bg-card p-4 shadow-[0_18px_55px_rgb(44_43_37/8%)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#d35c41]">Adicionar livros</p>
          <h2 className="mt-1 font-heading text-2xl font-bold tracking-[-0.04em]">
            {phase === 'review' || phase === 'saving' ? 'Cadastre os livros da foto' : 'Uma foto, vários livros'}
          </h2>
        </div>
        {!defaultOpen && (
          <Button
            aria-label="Fechar"
            size="icon"
            variant="ghost"
            onClick={() => {
              reset();
              setOpen(false);
            }}
          >
            <X />
          </Button>
        )}
      </div>

      {phase === 'pick' && (
        <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,0.8fr)_minmax(260px,1.2fr)]">
          <button
            type="button"
            className="group relative grid min-h-60 place-items-center overflow-hidden rounded-3xl border-2 border-dashed border-[#387c67]/30 bg-[#f3f7f3] p-5 text-center transition hover:border-[#387c67]/60"
            onClick={() => fileInput.current?.click()}
          >
            {previewUrl ? (
              <Image
                fill
                unoptimized
                sizes="(max-width: 640px) 100vw, 40vw"
                className="object-cover"
                src={previewUrl}
                alt="Prévia da foto escolhida"
              />
            ) : (
              <div>
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#dfece5] text-[#275b4b]">
                  <ImagePlus className="size-6" />
                </span>
                <p className="mt-4 font-semibold">Toque para abrir a câmera</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Fotografe a pilha, as capas ou a prateleira.
                </p>
              </div>
            )}
            {previewUrl && (
              <span className="absolute bottom-3 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">
                Trocar foto
              </span>
            )}
          </button>
          <div className="flex flex-col justify-center rounded-3xl bg-[#f6f1e8] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <BookPlus className="mt-0.5 size-5 shrink-0 text-[#d35c41]" />
              <div>
                <p className="font-semibold">Depois, anote os livros da foto</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  A próxima tela já abre oito fichas. Preencha quantas quiser e marque cada uma como empréstimo ou doação.
                </p>
              </div>
            </div>
            <Input
              ref={fileInput}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              capture="environment"
              onChange={(event) => choosePhoto(event.target.files?.[0] ?? null)}
            />
            <Button className="mt-6 h-12 rounded-2xl" disabled={!file} onClick={continueToBooks}>
              <Camera /> Continuar com esta foto
            </Button>
            <Button
              className="mt-2 h-10"
              variant="ghost"
              onClick={() => {
                setDrafts(Array.from({ length: 8 }, blankBook));
                setPhase('review');
              }}
            >
              <BookPlus /> Cadastrar sem foto
            </Button>
          </div>
        </div>
      )}

      {(phase === 'review' || phase === 'saving') && (
        <div className="mt-5">
          {previewUrl && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[#f3f7f3] p-3">
              <Image className="size-16 rounded-xl object-cover" unoptimized width={64} height={64} src={previewUrl} alt="Foto dos livros" />
              <div>
                <p className="font-semibold">Foto pronta</p>
                <p className="text-sm text-muted-foreground">Preencha só as fichas que precisar.</p>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {drafts.map((book, index) => (
              <article className="rounded-2xl border border-border bg-background p-4" key={book.localId}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    Livro {index + 1}
                  </span>
                  <Button
                    aria-label={`Remover ficha ${index + 1}`}
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setDrafts((current) => current.filter((item) => item.localId !== book.localId))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold" htmlFor={`title-${book.localId}`}>
                    Título
                    <Input
                      className="mt-1 h-11 rounded-xl bg-card"
                      id={`title-${book.localId}`}
                      value={book.title}
                      onChange={(event) => updateDraft(book.localId, { title: event.target.value })}
                      placeholder="Nome do livro"
                    />
                  </label>
                  <label className="text-sm font-semibold" htmlFor={`author-${book.localId}`}>
                    Autor ou autora
                    <Input
                      className="mt-1 h-11 rounded-xl bg-card"
                      id={`author-${book.localId}`}
                      value={book.author}
                      onChange={(event) => updateDraft(book.localId, { author: event.target.value })}
                      placeholder="Se souber"
                    />
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2" aria-label="Forma de circulação">
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${book.availability === 'loan' ? 'border-[#387c67] bg-[#e8f2ed] text-[#275b4b]' : 'border-border bg-card'}`}
                    onClick={() => updateDraft(book.localId, { availability: 'loan' })}
                  >
                    Quero emprestar
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${book.availability === 'donation' ? 'border-[#d35c41] bg-[#fff0eb] text-[#a74630]' : 'border-border bg-card'}`}
                    onClick={() => updateDraft(book.localId, { availability: 'donation' })}
                  >
                    Quero doar
                  </button>
                </div>
              </article>
            ))}
          </div>
          <Button
            className="mt-3 h-10 rounded-xl"
            variant="outline"
            onClick={() => setDrafts((current) => [...current, blankBook()])}
          >
            <Plus /> Adicionar outra ficha
          </Button>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button className="h-11 rounded-xl" variant="ghost" disabled={phase === 'saving'} onClick={reset}>
              Começar de novo
            </Button>
            <Button className="h-11 rounded-xl px-5" disabled={phase === 'saving'} onClick={saveBooks}>
              {phase === 'saving' ? <LoaderCircle className="animate-spin" /> : <Check />}
              {phase === 'saving' ? 'Salvando…' : 'Salvar na minha estante'}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p
          className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </section>
  );
}
