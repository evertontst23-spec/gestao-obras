import type { Metadata, Viewport } from 'next';
import { RegistrarSW } from '@/components/RegistrarSW';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Gestão de Obras', template: '%s · Gestão de Obras' },
  description: 'Planejamento, execução e acompanhamento de obras',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Obras', statusBarStyle: 'black-translucent' },
};
export const viewport: Viewport = { themeColor: '#1d1c1a', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}<RegistrarSW /></body>
    </html>
  );
}
