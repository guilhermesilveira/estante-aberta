import Link from 'next/link';
import { redirect } from 'next/navigation';

import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { RequestList } from '@/components/request-list';
import {
  getOrCreateProfileName,
  getOrCreateShelf,
  getOwnerRequests,
} from '@/db/repository';

export const dynamic = 'force-dynamic';

export default async function ConfirmedRequestsPage() {
  const user = await requireChatGPTUser('/minha-estante/confirmados');
  const profileName = await getOrCreateProfileName(user);
  if (!profileName)
    redirect('/cadastro?return_to=%2Fminha-estante%2Fconfirmados');
  const shelf = await getOrCreateShelf(user, profileName);
  const requests = await getOwnerRequests(shelf.id, 'accepted');

  return (
    <main className="min-h-dvh bg-background px-4 py-6 text-foreground sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          className="text-sm font-medium underline underline-offset-4"
          href="/minha-estante"
        >
          Voltar para minha estante
        </Link>
        <h1 className="mt-6 font-heading text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
          Pedidos confirmados
        </h1>
        <p className="mb-6 mt-2 text-muted-foreground">
          Marque como entregue depois de combinar a troca com seu grupo.
        </p>
        <RequestList initialRequests={requests} status="accepted" />
      </div>
    </main>
  );
}
