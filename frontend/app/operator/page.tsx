'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import ActionFeedback from '@/components/ActionFeedback';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import { Badge, PageContainer, SectionHeader, StatCard } from '@/components/ui';
import { apiFetch } from '@/lib/api';

type Period = {
  _id: string;
  estado: string;
};

const Icons = {
  open: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  total: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75h18M3 14.25h18M3 4.5h18v15H3z" />
    </svg>
  ),
  pending: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  flow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  )
};

const FLOW_STEPS = [
  {
    href: '/meter-readings',
    step: '01',
    title: 'Registrar lecturas',
    description: 'Captura lectura, consumo y foto del medidor con recorte.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  {
    href: '/supplier-invoice',
    step: '02',
    title: 'Cargar factura global',
    description: 'Ingresa consumo y valores oficiales del proveedor.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m-9 5h12a1.5 1.5 0 001.5-1.5V5.25A1.5 1.5 0 0018 3.75H6A1.5 1.5 0 004.5 5.25V19.5A1.5 1.5 0 006 21z" />
      </svg>
    )
  },
  {
    href: '/liquidation',
    step: '03',
    title: 'Ejecutar liquidación',
    description: 'Calcula energía, impuesto y total por cada casa.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l4-7 4 7-4 7-4-7zm10 0l4-7 4 7-4 7-4-7z" />
      </svg>
    )
  },
  {
    href: '/reports',
    step: '04',
    title: 'Revisar reporte',
    description: 'Valida tabla y gráficos antes de entregar resultados.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v18h16.5M7.5 14.25l3-3 3.75 3.75 4.5-6" />
      </svg>
    )
  },
  {
    href: '/pdfs',
    step: '05',
    title: 'Generar facturas PDF',
    description: 'Emite y descarga los recibos individuales.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M9 13.5h6m-6 3h3m1.5-12.75H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    )
  },
  {
    href: '/billing-periods',
    step: '·',
    title: 'Gestionar periodos',
    description: 'Abre y cierra periodos de facturación del condominio.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 5.25h15a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5h-15a1.5 1.5 0 01-1.5-1.5v-12a1.5 1.5 0 011.5-1.5z" />
      </svg>
    )
  }
];

export default function OperatorPage(): React.ReactNode {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Period[]>('/billing-periods')
      .then(setPeriods)
      .catch((err) => setError(err.message));
  }, []);

  const abiertos = periods.filter((period) => period.estado === 'abierto').length;

  return (
    <AuthGuard allowedRoles={['operador', 'superadmin']}>
      <AppShell>
        <PageContainer>
          <SectionHeader
            eyebrow="Panel operativo"
            title="Dashboard Operador"
            description="Gestiona lecturas, factura global y liquidación mensual en un flujo controlado."
            actions={
              <Badge tone="brand" dot>
                {abiertos} {abiertos === 1 ? 'periodo abierto' : 'periodos abiertos'}
              </Badge>
            }
          />

          <ActionFeedback error={error} />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Periodos abiertos" value={abiertos} icon={Icons.open} tone="accent" />
            <StatCard label="Periodos totales" value={periods.length} icon={Icons.total} tone="brand" />
            <StatCard
              label="Pendientes de facturar"
              value={Math.max(abiertos - 1, 0)}
              helper="Referencia operativa"
              icon={Icons.pending}
              tone="warn"
            />
            <StatCard
              label="Flujo recomendado"
              value="1-2-3"
              helper="Lecturas → Factura → Liquidación"
              icon={Icons.flow}
              tone="success"
            />
          </div>

          <section>
            <SectionHeader
              eyebrow="Flujo de trabajo"
              title="Ciclo mensual de facturación"
              description="Sigue estos pasos en orden para cerrar el periodo."
            />
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {FLOW_STEPS.map((step) => (
                <Link
                  key={step.href}
                  href={step.href}
                  className="group relative overflow-hidden rounded-2xl border border-border-soft bg-white p-5 shadow-elevation-1 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-elevation-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                      {step.icon}
                    </span>
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-bold text-ink-muted">
                      {step.step}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-ink">{step.title}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{step.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 transition-colors group-hover:text-brand-900">
                    Continuar
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </PageContainer>
      </AppShell>
    </AuthGuard>
  );
}
