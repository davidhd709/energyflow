import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';

// Inter para todo — body y títulos. Mismo trazo en toda la app, jerarquía
// se logra con tamaño y weight (400/500/600/700/800).
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800']
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
      <body className={`${inter.variable} font-[var(--font-body)] antialiased`}>{children}</body>
    </html>
  );
}
