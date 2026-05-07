import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';

import './globals.css';

// Inter para texto general (lo más usado en SaaS premium: Vercel, Linear, Stripe).
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['400', '500', '600', '700']
});

// Plus Jakarta Sans para títulos / display: también sans-serif, geometría
// más cálida para crear jerarquía sin volver a serif.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-title',
  display: 'swap',
  weight: ['500', '600', '700', '800']
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
      <body className={`${inter.variable} ${jakarta.variable} font-[var(--font-body)] antialiased`}>
        {children}
      </body>
    </html>
  );
}
