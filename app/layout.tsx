import type { Metadata, Viewport } from 'next';
import { DM_Sans, Fraunces } from 'next/font/google';

import './globals.css';
import { InstallAppProvider } from '@/components/install-app';
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
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Estante Aberta',
    statusBarStyle: 'default',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'mobile-web-app-capable': 'yes',
  },
  openGraph: {
    title: 'Estante Aberta',
    description: 'Livros que circulam para doar, emprestar e compartilhar.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Estante Aberta',
    description: 'Livros que circulam para doar, emprestar e compartilhar.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#183d33',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${bodyFont.variable} ${headingFont.variable} antialiased`}
      >
        <InstallAppProvider>{children}</InstallAppProvider>
      </body>
    </html>
  );
}
