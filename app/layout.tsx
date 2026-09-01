import type { Metadata } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';

import './globals.css';
import { SITE_ORIGIN } from '@/lib/site';

const bodyFont = DM_Sans({
  variable: '--font-body',
  subsets: ['latin'],
});

const headingFont = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: 'Estante Aberta — livros que circulam',
  description:
    'Fotografe seus livros, monte sua estante e compartilhe para doar ou emprestar.',
  openGraph: {
    title: 'Estante Aberta',
    description: 'Livros que circulam para doar, emprestar e criar novos encontros.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Estante Aberta',
    description: 'Livros que circulam para doar, emprestar e criar novos encontros.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${bodyFont.variable} ${headingFont.variable} antialiased`}>{children}</body>
    </html>
  );
}
