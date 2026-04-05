'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';

import { useSession } from '@/hooks/useSession';
import { logout } from '@/lib/auth';

type LinkItem = {
  href: string;
  label: string;
};

const operatorLinks: LinkItem[] = [
  { href: '/houses', label: 'Casas' },
  { href: '/billing-periods', label: 'Periodos' },
  { href: '/meter-readings', label: 'Lecturas' },
  { href: '/supplier-invoice', label: 'Factura global' },
  { href: '/liquidation', label: 'Liquidación' },
  { href: '/reports', label: 'Reporte' },
  { href: '/pdfs', label: 'PDFs' },
  { href: '/imports', label: 'Importar Excel' }
];
const adminLinks: LinkItem[] = [
  { href: '/reports', label: 'Reportes' },
  { href: '/pdfs', label: 'Facturas PDF' }
];

export default function AppShell({ children }: { children: React.ReactNode }): React.ReactNode {
  const { session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const role = session?.user.rol;
  const homeLink =
    role === 'superadmin' ? { href: '/superadmin', label: 'Dashboard SA' } : role === 'admin' ? { href: '/admin', label: 'Dashboard Admin' } : { href: '/operator', label: 'Dashboard Operador' };

  const links: LinkItem[] = [homeLink, ...(role === 'admin' ? adminLinks : operatorLinks)];
  const currentLabel = useMemo(() => links.find((link) => link.href === pathname)?.label || 'Panel', [links, pathname]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const initials = (session?.user.nombre || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen pb-6">
      <header className="sticky top-0 z-30 border-b border-pine-200/80 bg-white/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-3 py-3 sm:px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen((value) => !value)}
              className="rounded-xl border border-pine-200 bg-white p-2 text-pine-800 shadow-sm transition hover:bg-pine-50 lg:hidden"
              aria-label="Abrir navegación"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current">
                <path d="M4 7h16M4 12h16M4 17h16" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-black uppercase tracking-[0.12em] text-pine-800 sm:text-xl">EnergyFlow</h1>
              <p className="text-xs text-pine-700">{currentLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-pine-800 sm:gap-3">
            <div className="hidden rounded-2xl border border-pine-200 bg-white px-3 py-1.5 sm:block">
              <p className="text-[11px] uppercase tracking-[0.12em] text-pine-500">Usuario</p>
              <p className="font-semibold text-pine-900">{session?.user.nombre}</p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-pine-700 to-pine-500 text-sm font-bold text-white shadow-sm">
              {initials}
            </span>
            <button
              type="button"
              className="rounded-xl bg-pine-700 px-3 py-2 font-semibold text-cream transition hover:bg-pine-800"
              onClick={() => {
                logout();
                router.push('/login');
              }}
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1280px] gap-4 px-3 py-4 sm:px-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-6">
        <aside
          className={clsx(
            'fixed inset-y-0 left-0 z-40 w-[290px] max-w-[86vw] transform border-r border-pine-200 bg-gradient-to-b from-pine-900 to-pine-700 p-4 shadow-2xl transition-transform duration-300 lg:static lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:rounded-3xl lg:border lg:border-pine-200 lg:shadow-card',
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-white/90">Navegación</p>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg bg-white/15 p-2 text-white"
              aria-label="Cerrar navegación"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current">
                <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <nav className="flex flex-col gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    'rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    active
                      ? 'bg-white text-pine-900 shadow'
                      : 'text-white/90 hover:bg-white/18 hover:text-white'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {mobileNavOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-slate-950/45 lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Cerrar menú"
          />
        ) : null}

        <main className="soft-card animate-rise min-w-0 rounded-3xl p-4 sm:p-5 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
