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
      <body>{children}<RegistrarSW /></body>
    </html>
  );
}
