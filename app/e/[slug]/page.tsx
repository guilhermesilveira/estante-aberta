import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { PublicShelf } from '@/components/public-shelf';
import { getOrCreateProfileName, getPublicShelf } from '@/db/repository';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Estante compartilhada — Estante Aberta',
  description: 'Entre para ver uma estante compartilhada com você.',
  openGraph: { images: [] },
  twitter: { images: [] },
};

export default async function SharedShelfPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <AuthenticatedShelf slug={slug} />;
}

async function AuthenticatedShelf({ slug }: { slug: string }) {
  const viewer = await requireChatGPTUser(`/e/${slug}`);
  const viewerName = await getOrCreateProfileName(viewer);
  if (!viewerName) {
    redirect(`/cadastro?return_to=${encodeURIComponent(`/e/${slug}`)}`);
  }
  const data = await getPublicShelf(slug);
  if (!data) notFound();

  return (
    <PublicShelf
      books={data.books}
      shelf={data.shelf}
      viewerName={viewerName}
    />
  );
}
