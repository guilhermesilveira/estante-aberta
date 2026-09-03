import { BookOpen, Camera, Check, Library, Send, Sparkles } from 'lucide-react';
import Image from 'next/image';

import { chatGPTSignInPath } from '@/app/chatgpt-auth';
import { Badge } from '@/components/ui/badge';
import { HardLink } from '@/components/hard-link';
import { InstallAppButton } from '@/components/install-app';
import { TermsLink } from '@/components/terms-link';
import { buttonVariants } from '@/components/ui/button';

const sampleBooks = [
  {
    title: 'O Menino Maluquinho',
    author: 'Ziraldo',
    mode: 'Empresto',
    cover: '/covers/menino-maluquinho.jpg',
  },
  {
    title: 'Marcelo, marmelo, martelo',
    author: 'Ruth Rocha',
    mode: 'Doação',
    cover: '/covers/marcelo-marmelo-martelo.webp',
  },
  {
    title: 'Menina bonita do laço de fita',
    author: 'Ana Maria Machado',
    mode: 'Empresto',
    cover: '/covers/menina-bonita-do-laco-de-fita.jpg',
  },
];

export default function Home() {
  const myShelfPath = chatGPTSignInPath('/minha-estante');

  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-8 sm:py-5">
        <HardLink
          className="flex items-center gap-2.5"
          href="/"
          aria-label="Estante Aberta, início"
        >
          <span className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-[0_8px_24px_rgb(24_69_56/18%)]">
            <BookOpen className="size-5" strokeWidth={2.2} />
          </span>
          <span className="hidden font-heading text-lg font-bold tracking-[-0.03em] lg:inline">
            Estante Aberta
          </span>
        </HardLink>
        <div className="flex items-center gap-2">
          <InstallAppButton />
          <HardLink
            aria-label="Minha estante"
            className={buttonVariants({
              variant: 'outline',
              className: 'h-10 rounded-full px-3 sm:px-4',
            })}
            href={myShelfPath}
            target="_top"
          >
            <Library />
            <span className="sm:hidden">Estante</span>
            <span className="hidden sm:inline">Minha estante</span>
          </HardLink>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-10 pt-5 sm:px-8 sm:pt-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-10 lg:pb-20 lg:pt-16">
        <div className="relative z-10 max-w-xl">
          <Badge
            className="mb-4 h-7 bg-[#e8f2ed] px-3 text-[#275b4b] sm:mb-5"
            variant="secondary"
          >
            <Sparkles data-icon="inline-start" />
            A estante que circula
          </Badge>
          <h1 className="font-heading text-[2.5rem] font-bold leading-[0.96] tracking-[-0.06em] text-balance sm:text-[3.4rem] lg:text-[5.4rem]">
            Seus livros podem encontrar novas mãos.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground sm:mt-6 sm:text-lg sm:leading-8">
            Fotografe um livro por vez, escolha se quer doar ou emprestar e
            compartilhe sua estante com quem você gosta.
          </p>
          <div className="mt-6 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:gap-3">
            <HardLink
              className={buttonVariants({
                className:
                  'h-12 rounded-2xl px-5 text-base shadow-[0_12px_28px_rgb(24_69_56/20%)] sm:h-14 sm:px-6',
              })}
              href={myShelfPath}
              target="_top"
            >
              <Camera className="size-5" data-icon="inline-start" />
              Fotografar meus livros
            </HardLink>
            <a
              className={buttonVariants({
                variant: 'outline',
                className: 'h-12 rounded-2xl px-5 text-base sm:h-14 sm:px-6',
              })}
              href="#como-funciona"
            >
              Ver como funciona
            </a>
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground sm:mt-4">
            <Check className="size-4 text-[#387c67]" />
            Uma foto vira um livro na sua estante.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[620px]">
          <div className="absolute -left-24 top-10 size-64 rounded-full bg-[#f0be46]/20 blur-3xl" />
          <div className="absolute -right-24 bottom-0 size-64 rounded-full bg-[#ef6d4e]/15 blur-3xl" />
          <div className="relative rounded-[24px] border border-[#183d33]/10 bg-[#fffdf8] p-3 shadow-[0_24px_60px_rgb(44_43_37/12%)] sm:rotate-[1.5deg] sm:rounded-[32px] sm:p-6 sm:shadow-[0_30px_90px_rgb(44_43_37/14%)]">
            <div className="mb-4 flex items-center justify-between sm:mb-6">
              <div>
                <p className="text-sm font-semibold text-[#387c67]">
                  Estante da Ana
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  12 livros disponíveis
                </p>
              </div>
              <span className="grid size-10 place-items-center rounded-full bg-[#e8f2ed] text-[#275b4b]">
                <Send className="size-4" />
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2.5 sm:gap-5">
              {sampleBooks.map((book, index) => (
                <article className="min-w-0" key={book.title}>
                  <div className="relative aspect-[3/4] overflow-hidden rounded-[16px] bg-white shadow-[0_12px_22px_rgb(46_44_37/16%)]">
                    <Image
                      fill
                      sizes="(max-width: 640px) 30vw, 180px"
                      className="object-contain"
                      src={book.cover}
                      alt={`Capa de ${book.title}`}
                    />
                    <span className="absolute right-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">
                      0{index + 1}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-xs font-semibold sm:mt-3 sm:text-sm">
                    {book.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {book.mode}
                  </p>
                </article>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-[#f4efe4] px-3 py-2.5 text-center text-xs font-medium text-[#725c29] sm:mt-6 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm">
              Escolha quantos livros quiser
            </div>
          </div>
        </div>
      </section>

      <section
        className="border-y border-border/70 bg-[#f6f1e8]"
        id="como-funciona"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:grid-cols-3 sm:gap-8 sm:px-8 sm:py-14">
          {[
            ['01', 'Fotografe', 'Abra a câmera ou envie uma foto do livro.'],
            ['02', 'Escolha', 'Marque o livro como doação ou empréstimo.'],
            [
              '03',
              'Compartilhe',
              'Envie ao seu grupo. A entrega acontece no local já combinado.',
            ],
          ].map(([number, title, description]) => (
            <article className="flex gap-4" key={number}>
              <span className="font-heading text-sm font-bold text-[#d35c41]">
                {number}
              </span>
              <div>
                <h2 className="font-heading text-xl font-bold tracking-[-0.03em]">
                  {title}
                </h2>
                <p className="mt-2 leading-6 text-muted-foreground">
                  {description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-7 text-sm leading-6 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8">
        <p>
          Use somente com pessoas conhecidas e no local definido pelo grupo.
        </p>
        <TermsLink className="text-foreground" />
      </footer>
    </main>
  );
}
