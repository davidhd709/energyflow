'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';

import { useSession } from '@/hooks/useSession';
import { logout } from '@/lib/auth';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const HomeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 11.5L12 4l9 7.5M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9" />
  </svg>
);

const HousesIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 21V9.75l7.5-5.25 7.5 5.25V21M9 21v-6h6v6" />
  </svg>
);

const PeriodsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 5.25h15a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5h-15a1.5 1.5 0 01-1.5-1.5v-12a1.5 1.5 0 011.5-1.5z" />
  </svg>
);

const ReadingsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const InvoiceIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m-9 5h12a1.5 1.5 0 001.5-1.5V5.25A1.5 1.5 0 0018 3.75H6A1.5 1.5 0 004.5 5.25V19.5A1.5 1.5 0 006 21z" />
  </svg>
);

const LiquidationIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l4-7 4 7-4 7-4-7zm10 0l4-7 4 7-4 7-4-7z" />
  </svg>
);

const ReportsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v18h16.5M7.5 14.25l3-3 3.75 3.75 4.5-6" />
  </svg>
);

const PdfsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M9 13.5h6m-6 3h3m1.5-12.75H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const ImportIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const operatorLinks: NavItem[] = [
  { href: '/houses', label: 'Casas', icon: HousesIcon },
  { href: '/billing-periods', label: 'Periodos', icon: PeriodsIcon },
  { href: '/meter-readings', label: 'Lecturas', icon: ReadingsIcon },
  { href: '/supplier-invoice', label: 'Factura global', icon: InvoiceIcon },
  { href: '/liquidation', label: 'Liquidación', icon: LiquidationIcon },
  { href: '/reports', label: 'Reporte', icon: ReportsIcon },
  { href: '/pdfs', label: 'PDFs', icon: PdfsIcon },
  { href: '/imports', label: 'Importar Excel', icon: ImportIcon }
];

const adminLinks: NavItem[] = [
  { href: '/reports', label: 'Reportes', icon: ReportsIcon },
  { href: '/pdfs', label: 'Facturas PDF', icon: PdfsIcon }
];

const roleLabels: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Administrador',
  operador: 'Operador'
};

export default function AppShell({ children }: { children: React.ReactNode }): React.ReactNode {
  const { session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const role = session?.user.rol;

  const links: NavItem[] = useMemo(() => {
    const homeLink: NavItem =
      role === 'superadmin'
        ? { href: '/superadmin', label: 'Dashboard SA', icon: HomeIcon }
        : role === 'admin'
          ? { href: '/admin', label: 'Dashboard Admin', icon: HomeIcon }
          : { href: '/operator', label: 'Dashboard Operador', icon: HomeIcon };
    return [homeLink, ...(role === 'admin' ? adminLinks : operatorLinks)];
  }, [role]);

  const currentLabel = useMemo(
    () => links.find((link) => link.href === pathname)?.label || 'Panel',
    [links, pathname]
  );

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const initials = (session?.user.nombre || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const Brand = (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient shadow-elevation-2 ring-1 ring-white/30">
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white">
          <path
            d="M13 2L4 13h6l-1 9 9-11h-6l1-9z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="0.5"
            strokeLinejoin="round"
          />
        </svg>
        <span className="absolute -inset-1 rounded-xl bg-brand-400/20 blur-md" aria-hidden="true" />
      </div>
      <div className="leading-tight">
        <p className="font-display text-base font-bold tracking-tight text-white">EnergyFlow</p>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/60">SaaS</p>
      </div>
    </div>
  );

  const NavList = (
    <nav className="flex flex-col gap-1 px-3">
      <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.20em] text-white/40">
        Operación
      </p>
      {links.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(
              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
              active
                ? 'bg-white text-brand-900 shadow-elevation-2'
                : 'text-white/80 hover:bg-white/10 hover:text-white'
            )}
          >
            {active ? (
              <span
                className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent-400"
                aria-hidden="true"
              />
            ) : null}
            <span
              className={clsx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                active ? 'bg-brand-50 text-brand-700' : 'bg-white/5 text-white/80 group-hover:bg-white/15 group-hover:text-white'
              )}
            >
              {link.icon}
            </span>
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const UserCard = (
    <div className="m-3 mt-auto rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent-400 to-brand-500 text-sm font-bold text-white shadow-elevation-2">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{session?.user.nombre || 'Usuario'}</p>
          <p className="truncate text-xs text-white/60">
            {role ? roleLabels[role] || role : 'Sin rol'}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        onClick={async () => {
          await logout();
          router.push('/login');
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-7.5A2.25 2.25 0 003.75 5.25v13.5A2.25 2.25 0 006 21h7.5a2.25 2.25 0 002.25-2.25V15M21 12H9m12 0l-3-3m3 3l-3 3" />
        </svg>
        Cerrar sesión
      </button>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Topbar móvil */}
      <header className="sticky top-0 z-30 border-b border-border-soft bg-white/90 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-soft bg-white text-ink-soft shadow-elevation-1 transition-colors hover:bg-brand-50"
            aria-label="Abrir navegación"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">EnergyFlow</p>
            <p className="text-sm font-semibold text-ink">{currentLabel}</p>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-700 to-accent-500 text-sm font-bold text-white shadow-elevation-2">
            {initials}
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1480px]">
        {/* Sidebar desktop / drawer móvil */}
        <aside
          className={clsx(
            'fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 text-white shadow-elevation-4 transition-transform duration-300 lg:sticky lg:top-0 lg:z-30 lg:h-screen lg:translate-x-0',
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
            {Brand}
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg bg-white/10 p-2 text-white transition-colors hover:bg-white/20 lg:hidden"
              aria-label="Cerrar navegación"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-5">{NavList}</div>

          {UserCard}
        </aside>

        {/* Backdrop móvil */}
        {mobileNavOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Cerrar menú"
          />
        ) : null}

        {/* Main */}
        <div className="min-w-0 flex-1">
          {/* Topbar desktop */}
          <header className="hidden border-b border-border-soft bg-white/70 backdrop-blur-xl lg:block">
            <div className="flex h-16 items-center justify-between gap-4 px-6 xl:px-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">EnergyFlow</p>
                <h1 className="text-lg font-semibold text-ink">{currentLabel}</h1>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden rounded-xl border border-border-soft bg-white px-4 py-2 text-right md:block">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Usuario</p>
                  <p className="text-sm font-semibold text-ink">{session?.user.nombre || 'Usuario'}</p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-700 to-accent-500 text-sm font-bold text-white shadow-elevation-2">
                  {initials}
                </span>
              </div>
            </div>
          </header>

          <main className="px-3 py-5 sm:px-4 sm:py-6 lg:px-6 lg:py-8 xl:px-8">
            <div className="animate-fade-in-up">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
