'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import ActionFeedback from '@/components/ActionFeedback';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import MetricCard from '@/components/MetricCard';
import { apiFetch } from '@/lib/api';

type Period = {
  _id: string;
  estado: string;
};

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
        <section className="space-y-6">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-700/70">Panel operativo</p>
            <h2 className="font-[var(--font-title)] text-2xl text-pine-900 sm:text-3xl">Dashboard Operador</h2>
            <p className="max-w-3xl text-sm text-pine-800/80 sm:text-base">
              Gestiona lecturas, factura global y liquidación mensual en un flujo controlado.
            </p>
          </header>
          <ActionFeedback loading={false} success="" error={error} />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Periodos abiertos" value={abiertos} />
            <MetricCard title="Periodos totales" value={periods.length} />
            <MetricCard title="Pendientes de facturar" value={Math.max(abiertos - 1, 0)} helper="Referencia operativa" />
            <MetricCard title="Flujo recomendado" value="1-2-3" helper="Lecturas → Factura → Liquidación" />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Link className="soft-card rounded-2xl p-5 transition hover:-translate-y-0.5" href="/meter-readings">
              <p className="text-sm font-semibold text-pine-900">1. Registrar lecturas</p>
              <p className="mt-1 text-sm text-pine-700/80">Captura lectura, consumo y foto del medidor con recorte.</p>
            </Link>
            <Link className="soft-card rounded-2xl p-5 transition hover:-translate-y-0.5" href="/supplier-invoice">
              <p className="text-sm font-semibold text-pine-900">2. Cargar factura global</p>
              <p className="mt-1 text-sm text-pine-700/80">Ingresa consumo y valores oficiales del proveedor.</p>
            </Link>
            <Link className="soft-card rounded-2xl p-5 transition hover:-translate-y-0.5" href="/liquidation">
              <p className="text-sm font-semibold text-pine-900">3. Ejecutar liquidación</p>
              <p className="mt-1 text-sm text-pine-700/80">Calcula energía, impuesto y total por cada casa.</p>
            </Link>
            <Link className="soft-card rounded-2xl p-5 transition hover:-translate-y-0.5" href="/reports">
              <p className="text-sm font-semibold text-pine-900">4. Revisar reporte</p>
              <p className="mt-1 text-sm text-pine-700/80">Valida tabla y gráficos antes de entregar resultados.</p>
            </Link>
            <Link className="soft-card rounded-2xl p-5 transition hover:-translate-y-0.5" href="/pdfs">
              <p className="text-sm font-semibold text-pine-900">5. Generar facturas PDF</p>
              <p className="mt-1 text-sm text-pine-700/80">Emite y descarga los recibos individuales.</p>
            </Link>
            <Link className="soft-card rounded-2xl p-5 transition hover:-translate-y-0.5" href="/billing-periods">
              <p className="text-sm font-semibold text-pine-900">Gestionar periodos</p>
              <p className="mt-1 text-sm text-pine-700/80">Abre y cierra periodos de facturación del condominio.</p>
            </Link>
          </div>
        </section>
      </AppShell>
    </AuthGuard>
  );
}
