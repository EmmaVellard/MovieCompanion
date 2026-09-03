import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Movie Companion',
  description:
    'Three personal picks from your Letterboxd watchlist for tonight.',
  applicationName: 'Movie Companion',
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: `${basePath}/favicon.svg`,
    apple: `${basePath}/icon-192.png`,
  },
  openGraph: {
    type: 'website',
    title: 'Movie Companion',
    description: 'Three thoughtful picks for tonight.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Movie Companion',
    description: 'Three thoughtful picks for tonight.',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Movie Companion',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0c0f',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
