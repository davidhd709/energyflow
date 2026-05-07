'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import ActionFeedback from '@/components/ActionFeedback';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import TableBlock from '@/components/TableBlock';
import { Badge, EmptyState, PageContainer, SectionHeader, StatCard, StatusBadge } from '@/components/ui';
import { apiFetch } from '@/lib/api';

type Period = {
  _id: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias: number;
  estado: string;
};

const Icons = {
  total: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75h18M3 14.25h18M3 4.5h18v15H3z" />
    </svg>
  ),
  closed: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  calculated: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v16m6-16v16M5 8h14M5 16h14" />
    </svg>
  ),
  pending: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.5h.008M5.25 19.5h13.5a2.25 2.25 0 002.05-3.215L13.92 4.875a2.25 2.25 0 00-3.84 0L3.2 16.285A2.25 2.25 0 005.25 19.5z" />
    </svg>
  )
};

const QUICK_LINKS = [
  {
    href: '/reports',
    title: 'Reporte general',
    description: 'Vista tabular y gráfica por casas con exportación Excel/PDF.',
    cta: 'Ir a reportes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v18h16.5M7.5 14.25l3-3 3.75 3.75 4.5-6" />
      </svg>
    )
  },
  {
    href: '/pdfs',
    title: 'Facturas por casa',
    description: 'Consulta, genera y descarga recibos individuales en PDF.',
    cta: 'Ir a facturas',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M9 13.5h6m-6 3h3m1.5-12.75H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    )
  },
  {
    href: '/reports',
    title: 'Consumo por casa',
    description: 'Monitorea el comportamiento de consumo con gráficos de barras.',
    cta: 'Ver gráfico',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21V10m6 11V6m6 15v-8m6 8V3" />
      </svg>
    )
  }
];

export default function AdminPage(): React.ReactNode {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Period[]>('/billing-periods')
      .then((periodData) => {
        setPeriods(periodData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const cerrados = periods.filter((p) => p.estado === 'cerrado').length;
  const calculados = periods.filter((p) => p.estado === 'calculado').length;
  const abiertos = periods.filter((p) => p.estado === 'abierto').length;

  return (
    <AuthGuard allowedRoles={['admin']}>
      <AppShell>
        <PageContainer>
          <SectionHeader
            eyebrow="Panel administrativo"
            title="Dashboard Administrador"
            description="Consulta periodos, revisa reportes de consumo y descarga facturas por casa del condominio."
          />

          <ActionFeedback error={error} />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Periodos registrados"
              value={loading ? '—' : periods.length}
              helper="Histórico completo disponible"
              icon={Icons.total}
              tone="brand"
              loading={loading}
            />
            <StatCard
              label="Periodos cerrados"
              value={loading ? '—' : cerrados}
              icon={Icons.closed}
              tone="success"
              loading={loading}
            />
            <StatCard
              label="Periodos calculados"
              value={loading ? '—' : calculados}
              icon={Icons.calculated}
              tone="accent"
              loading={loading}
            />
            <StatCard
              label="Pendientes por cerrar"
              value={loading ? '—' : abiertos}
              helper="Seguimiento operativo"
              icon={Icons.pending}
              tone="warn"
              loading={loading}
            />
          </div>

          <section>
            <SectionHeader
              eyebrow="Acceso rápido"
              title="Operaciones frecuentes"
              description="Atajos a las vistas que más usas."
            />
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {QUICK_LINKS.map((link) => (
                <Link
                  key={`${link.href}-${link.title}`}
                  href={link.href}
                  className="group relative overflow-hidden rounded-2xl border border-border-soft bg-white p-5 shadow-elevation-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevation-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                    {link.icon}
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-ink">{link.title}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{link.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 transition-colors group-hover:text-brand-900">
                    {link.cta}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <SectionHeader
              eyebrow="Histórico"
              title="Periodos de facturación"
              description="Resumen completo del ciclo de facturación."
              actions={
                <Badge tone="neutral">
                  {periods.length} {periods.length === 1 ? 'registro' : 'registros'}
                </Badge>
              }
            />
            <div className="mt-5">
              {periods.length === 0 && !loading ? (
                <EmptyState
                  title="Aún no hay periodos registrados"
                  description="Cuando el operador cree el primer periodo, aparecerá aquí."
                />
              ) : (
                <TableBlock
                  columns={['Periodo', 'Días', 'Estado']}
                  rows={periods.map((period) => ({
                    Periodo: `${period.fecha_inicio} a ${period.fecha_fin}`,
                    Días: period.dias,
                    Estado: <StatusBadge status={period.estado} />
                  }))}
                />
              )}
            </div>
          </section>
        </PageContainer>
      </AppShell>
    </AuthGuard>
  );
}
