import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { chatGPTSignInPath, getChatGPTUser } from '@/app/chatgpt-auth';
import { PublicShelf } from '@/components/public-shelf';
import { getOrCreateProfileName, getPublicShelf } from '@/db/repository';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Estante compartilhada — Estante Aberta',
  description:
    'Veja os livros desta estante compartilhada, sem precisar entrar.',
  robots: { index: false, follow: false },
  openGraph: { images: [] },
  twitter: { images: [] },
};

export default async function SharedShelfPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Only published shelves and public book states are returned by this query.
  // Browsing is public; identity is needed only when the visitor places a request.
  const data = await getPublicShelf(slug);
  if (!data) notFound();
  const viewer = await getChatGPTUser();
  const viewerName = viewer ? await getOrCreateProfileName(viewer) : null;
  const returnTo = `/e/${slug}`;
  const requestAccessHref = viewerName
    ? undefined
    : viewer
      ? `/cadastro?return_to=${encodeURIComponent(returnTo)}`
      : chatGPTSignInPath(returnTo);

  return (
    <PublicShelf
      books={data.books}
      shelf={data.shelf}
      viewerName={viewerName}
      requestAccessHref={requestAccessHref}
    />
  );
}
