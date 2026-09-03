import type { Metadata } from 'next';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  MapPin,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';

import { HardLink } from '@/components/hard-link';

export const metadata: Metadata = {
  title: 'Termos de uso e segurança — Estante Aberta',
  description:
    'Regras para empréstimos e doações de livros entre pessoas conhecidas, em um único local de troca definido pelo grupo.',
};

const sections = [
  {
    icon: UsersRound,
    title: '1. Uso entre pessoas conhecidas',
    paragraphs: [
      'A Estante Aberta foi feita para grupos que já existem e cujos participantes se conhecem. Ela não é uma rede para descobrir pessoas, fazer novos contatos ou marcar encontros com desconhecidos.',
      'Compartilhe o link da estante somente dentro do grupo. Se você não reconhecer a pessoa pelo nome exibido no pedido, não confirme a troca até verificar quem ela é pelos canais que o grupo já usa.',
    ],
  },
  {
    icon: MapPin,
    title: '2. Um único local de troca',
    paragraphs: [
      'Antes de usar a Estante Aberta, o grupo deve escolher um único local habitual, conhecido por todos, para empréstimos, doações, entregas e devoluções.',
      'Não combine um endereço ou ponto diferente para cada pedido. Não marque encontros em casas, locais improvisados ou fora do espaço definido pelo grupo. A plataforma não oferece nem recomenda entregas fora desse local.',
    ],
  },
  {
    icon: BookOpen,
    title: '3. Pedidos não são garantia',
    paragraphs: [
      'Selecionar ou pedir um livro não garante empréstimo nem doação. A pessoa dona da estante decide quais livros poderá confirmar e pode aceitar apenas parte do pedido ou recusá-lo.',
      'Uma confirmação também não significa que a Estante Aberta reservou, inspecionou, transportou ou entregou o livro. As regras de cuidado, prazo e devolução são responsabilidade do grupo e das pessoas envolvidas.',
    ],
  },
  {
    icon: UserRoundCheck,
    title: '4. Nome e privacidade',
    paragraphs: [
      'O nome exibido no pedido vem da conta usada para acessar o site. Ele serve para que a pessoa dona da estante reconheça quem fez o pedido, mas a Estante Aberta não confirma a identidade nem o vínculo dessa pessoa com o grupo.',
      'O pedido não pede WhatsApp, endereço nem mensagem. Não publique nomes, links da estante, capturas de tela ou informações sobre participantes fora do grupo. Não use o nome exibido para localizar, expor ou contatar alguém fora do contexto da troca.',
    ],
  },
  {
    icon: ShieldCheck,
    title: '5. Responsabilidades de cada pessoa',
    paragraphs: [
      'Quem disponibiliza um livro responde por decidir o que pode emprestar ou doar e por informar sua condição. Quem recebe responde pelo cuidado e, no caso de empréstimo, pela devolução conforme as regras do grupo.',
      'O grupo responde por escolher seus participantes, manter um único local de troca e definir suas regras. Cada pessoa decide se aceita ou realiza uma troca.',
    ],
  },
  {
    icon: AlertTriangle,
    title: '6. Limites de responsabilidade da plataforma',
    paragraphs: [
      'A Estante Aberta apenas organiza estantes e encaminha pedidos. Ela não é parte do empréstimo ou da doação, não guarda livros, não verifica propriedade, identidade, disponibilidade ou estado dos itens e não acompanha entregas ou devoluções.',
      'Nos limites permitidos pela legislação aplicável, a plataforma não responde por encontros, trocas realizadas fora do local do grupo, perda, dano, atraso, não devolução ou uso indevido por participantes. Estes termos não afastam direitos ou responsabilidades que a lei não permita excluir.',
    ],
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f6f1e8] text-foreground">
      <header className="overflow-hidden bg-[#183d33] px-5 pb-12 pt-6 text-white sm:pb-16 sm:pt-8">
        <div className="mx-auto max-w-4xl">
          <HardLink
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/75 transition hover:text-white"
            href="/"
          >
            <ArrowLeft className="size-4" /> Voltar para a Estante Aberta
          </HardLink>
          <div className="mt-10 max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#f0be46]">
              Termos de uso e segurança
            </p>
            <h1 className="mt-3 font-heading text-[clamp(2.7rem,9vw,5.2rem)] font-bold leading-[0.95] tracking-[-0.065em] text-balance">
              Trocas seguras começam dentro do grupo.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/75">
              Leia estas regras antes de disponibilizar ou pedir um livro.
            </p>
          </div>
        </div>
      </header>

      <article className="mx-auto w-full max-w-4xl px-5 pb-16 sm:pb-24">
        <section className="-mt-6 rounded-[28px] border border-[#d59b19]/35 bg-[#fff7dd] p-5 shadow-[0_18px_50px_rgb(44_43_37/10%)] sm:-mt-8 sm:p-7">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#8a6415]">
            Regra principal
          </p>
          <p className="mt-3 text-lg font-semibold leading-8 text-[#4f421f] sm:text-xl">
            Use somente com pessoas que você conhece. O grupo deve ter um único
            local de troca, definido antes dos pedidos. Não use a plataforma
            para conhecer ou encontrar desconhecidos.
          </p>
        </section>

        <div className="mt-8 space-y-4 sm:mt-10">
          {sections.map(({ icon: Icon, title, paragraphs }) => (
            <section
              className="rounded-[24px] border bg-card p-5 shadow-[0_10px_32px_rgb(44_43_37/6%)] sm:p-7"
              key={title}
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#e8f2ed] text-[#275b4b]">
                  <Icon className="size-5" />
                </span>
                <div>
                  <h2 className="font-heading text-2xl font-bold tracking-[-0.035em]">
                    {title}
                  </h2>
                  <div className="mt-3 space-y-3 text-base leading-7 text-muted-foreground">
                    {paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-8 border-t pt-6 text-sm leading-6 text-muted-foreground">
          <p>
            O uso da Estante Aberta está sujeito a estes termos. Última
            atualização: 3 de setembro de 2026.
          </p>
        </footer>
      </article>
    </main>
  );
}
