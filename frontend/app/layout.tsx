import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';

import './globals.css';

// Roboto para toda la app — body y títulos. Sans-serif clara y neutra.
const roboto = Roboto({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['400', '500', '700', '900']
});

export const metadata: Metadata = {
  title: 'EnergyFlow SaaS',
  description: 'Gestión de lecturas y facturación de energía para condominios',
  icons: {
    icon: '/brand/logo.png',
    apple: '/brand/logo.png'
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactNode {
  return (
    <html lang="es">
      <body className={`${roboto.variable} font-[var(--font-body)] antialiased`}>{children}</body>
    </html>
  );
}
