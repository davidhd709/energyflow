import type { Metadata } from 'next';
import { Lora, Montserrat } from 'next/font/google';

import './globals.css';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700', '800', '900']
});

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-title',
  weight: ['600', '700']
});

export const metadata: Metadata = {
  title: 'EnergyFlow SaaS',
  description: 'Gestión de lecturas y facturación de energía para condominios'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactNode {
  return (
    <html lang="es">
      <body className={`${montserrat.variable} ${lora.variable} font-[var(--font-body)] antialiased`}>{children}</body>
    </html>
  );
}
