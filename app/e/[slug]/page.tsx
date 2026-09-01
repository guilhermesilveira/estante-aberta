import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PublicShelf } from '@/components/public-shelf';
import { getPublicShelf, getRuntimeEnv } from '@/db/repository';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicShelf(slug);
  if (!data) return { title: 'Estante não encontrada' };

  const title = `${data.shelf.name} — Estante Aberta`;
  const description = `${data.books.length} livros disponíveis para doar ou emprestar. Escolha até 8.`;
  const firstPhoto = data.books.find((book) => book.photoBatchId)?.photoBatchId;
  const siteOrigin = getRuntimeEnv().PUBLIC_SITE_URL || 'http://localhost:3000';
  const images = firstPhoto ? [new URL(`/api/photos/${firstPhoto}`, siteOrigin).toString()] : [];

  return {
    title,
    description,
    openGraph: { title, description, images },
    twitter: { card: 'summary_large_image', title, description, images },
  };
}

export default async function SharedShelfPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getPublicShelf(slug);
  if (!data) notFound();

  return <PublicShelf books={data.books} shelf={data.shelf} />;
}
