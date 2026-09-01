import { BookOpen, Camera, Check, Send, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { HardLink } from '@/components/hard-link';
import { buttonVariants } from '@/components/ui/button';

const sampleBooks = [
  {
    title: 'Ideias para adiar o fim do mundo',
    author: 'Ailton Krenak',
    mode: 'Empresto',
    tone: 'bg-[#ef6d4e]',
  },
  {
    title: 'Torto arado',
    author: 'Itamar Vieira Junior',
    mode: 'Doação',
    tone: 'bg-[#e2b63d]',
  },
  {
    title: 'Quarto de despejo',
    author: 'Carolina Maria de Jesus',
    mode: 'Empresto',
    tone: 'bg-[#387c67]',
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <HardLink className="flex items-center gap-2.5" href="/" aria-label="Estante Aberta, início">
          <span className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-[0_8px_24px_rgb(24_69_56/18%)]">
            <BookOpen className="size-5" strokeWidth={2.2} />
          </span>
          <span className="font-heading text-lg font-bold tracking-[-0.03em]">Estante Aberta</span>
        </HardLink>
        <HardLink className={buttonVariants({ variant: 'outline', className: 'h-10 rounded-full px-4' })} href="/minha-estante">
          Minha estante
        </HardLink>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-12 pt-8 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:pb-20 lg:pt-16">
        <div className="relative z-10 max-w-xl">
          <Badge className="mb-5 h-7 bg-[#e8f2ed] px-3 text-[#275b4b]" variant="secondary">
            <Sparkles data-icon="inline-start" />
            A estante que circula
          </Badge>
          <h1 className="font-heading text-[clamp(2.65rem,7vw,5.4rem)] font-bold leading-[0.94] tracking-[-0.07em] text-balance">
            Seus livros podem encontrar novas mãos.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
            Fotografe uma pilha, cadastre os livros do seu jeito e compartilhe sua estante com quem você gosta — para doar ou emprestar.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <HardLink className={buttonVariants({ className: 'h-14 rounded-2xl px-6 text-base shadow-[0_12px_28px_rgb(24_69_56/20%)]' })} href="/minha-estante">
              <Camera className="size-5" data-icon="inline-start" />
              Fotografar meus livros
            </HardLink>
            <a className={buttonVariants({ variant: 'outline', className: 'h-14 rounded-2xl px-6 text-base' })} href="#como-funciona">
              Ver como funciona
            </a>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="size-4 text-[#387c67]" />
            Uma foto pode registrar vários livros de uma vez.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[620px]">
          <div className="absolute -left-24 top-10 size-64 rounded-full bg-[#f0be46]/20 blur-3xl" />
          <div className="absolute -right-24 bottom-0 size-64 rounded-full bg-[#ef6d4e]/15 blur-3xl" />
          <div className="relative rotate-[1.5deg] rounded-[32px] border border-[#183d33]/10 bg-[#fffdf8] p-4 shadow-[0_30px_90px_rgb(44_43_37/14%)] sm:p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#387c67]">Estante da Ana</p>
                <p className="mt-1 text-xs text-muted-foreground">12 livros disponíveis</p>
              </div>
              <span className="grid size-10 place-items-center rounded-full bg-[#e8f2ed] text-[#275b4b]">
                <Send className="size-4" />
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:gap-5">
              {sampleBooks.map((book, index) => (
                <article className="min-w-0" key={book.title}>
                  <div className={`${book.tone} relative aspect-[3/4] overflow-hidden rounded-[16px] p-3 text-white shadow-[0_12px_22px_rgb(46_44_37/16%)]`}>
                    <span className="absolute inset-y-0 left-3 w-px bg-white/30" />
                    <span className="absolute right-2 top-2 text-[10px] font-semibold opacity-70">0{index + 1}</span>
                    <p className="mt-8 font-heading text-[clamp(0.72rem,2.4vw,1.05rem)] font-bold leading-tight tracking-[-0.025em]">{book.title}</p>
                    <p className="absolute bottom-3 left-3 right-2 text-[9px] font-medium uppercase tracking-[0.08em] opacity-80">{book.author}</p>
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold">{book.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{book.mode}</p>
                </article>
              ))}
            </div>
            <div className="mt-6 rounded-2xl bg-[#f4efe4] px-4 py-3 text-center text-sm font-medium text-[#725c29]">
              Escolha até 8 para o próximo encontro
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-[#f6f1e8]" id="como-funciona">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:grid-cols-3 sm:px-8 sm:py-14">
          {[
            ['01', 'Fotografe', 'Aponte a câmera para a pilha ou para a prateleira.'],
            ['02', 'Cadastre', 'Anote os títulos e escolha: doar ou emprestar.'],
            ['03', 'Compartilhe', 'Envie no WhatsApp e combine a entrega no encontro.'],
          ].map(([number, title, description]) => (
            <article className="flex gap-4" key={number}>
              <span className="font-heading text-sm font-bold text-[#d35c41]">{number}</span>
              <div>
                <h2 className="font-heading text-xl font-bold tracking-[-0.03em]">{title}</h2>
                <p className="mt-2 leading-6 text-muted-foreground">{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
