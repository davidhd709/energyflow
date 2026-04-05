'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import ActionFeedback from '@/components/ActionFeedback';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import MetricCard from '@/components/MetricCard';
import TableBlock from '@/components/TableBlock';
import { apiFetch } from '@/lib/api';

type Period = {
  _id: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias: number;
  estado: string;
};

export default function AdminPage(): React.ReactNode {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Period[]>('/billing-periods')
      .then((periodData) => {
        setPeriods(periodData);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <AuthGuard allowedRoles={['admin']}>
      <AppShell>
        <section className="space-y-6">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-700/70">Panel administrativo</p>
            <h2 className="font-[var(--font-title)] text-2xl text-pine-900 sm:text-3xl">Dashboard Administrador</h2>
            <p className="max-w-3xl text-sm text-pine-800/80 sm:text-base">
              Consulta periodos, revisa reportes de consumo y descarga facturas por casa del condominio.
            </p>
          </header>
          <ActionFeedback loading={false} success="" error={error} />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Periodos registrados" value={periods.length} helper="Histórico completo disponible" />
            <MetricCard title="Periodos cerrados" value={periods.filter((period) => period.estado === 'cerrado').length} />
            <MetricCard title="Periodos calculados" value={periods.filter((period) => period.estado === 'calculado').length} />
            <MetricCard
              title="Pendientes por cerrar"
              value={periods.filter((period) => period.estado === 'abierto').length}
              helper="Seguimiento operativo del ciclo"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Link
              className="soft-card group rounded-2xl p-5 transition hover:-translate-y-0.5"
              href="/reports"
            >
              <p className="text-sm font-semibold text-pine-900">Reporte general</p>
              <p className="mt-1 text-sm text-pine-700/80">Vista tabular + gráfica por casas con exportación Excel/PDF.</p>
              <span className="mt-3 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-pine-700 group-hover:text-pine-900">
                Ir a reportes
              </span>
            </Link>
            <Link
              className="soft-card group rounded-2xl p-5 transition hover:-translate-y-0.5"
              href="/pdfs"
            >
              <p className="text-sm font-semibold text-pine-900">Facturas por casa</p>
              <p className="mt-1 text-sm text-pine-700/80">Consulta, genera y descarga recibos individuales en PDF.</p>
              <span className="mt-3 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-pine-700 group-hover:text-pine-900">
                Ir a facturas
              </span>
            </Link>
            <Link
              className="soft-card group rounded-2xl p-5 transition hover:-translate-y-0.5"
              href="/reports"
            >
              <p className="text-sm font-semibold text-pine-900">Consumo por casa</p>
              <p className="mt-1 text-sm text-pine-700/80">Monitorea el comportamiento de consumo con gráficos de barras.</p>
              <span className="mt-3 inline-flex text-xs font-semibold uppercase tracking-[0.12em] text-pine-700 group-hover:text-pine-900">
                Ver gráfico
              </span>
            </Link>
          </div>

          <div className="soft-card rounded-2xl p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-pine-900 sm:text-lg">Histórico de periodos</h3>
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-pine-700">
                {periods.length} registros
              </span>
            </div>
            <TableBlock
              columns={['Periodo', 'Días', 'Estado']}
              rows={periods.map((period) => ({
                Periodo: `${period.fecha_inicio} a ${period.fecha_fin}`,
                Días: period.dias,
                Estado: period.estado
              }))}
            />
          </div>
        </section>
      </AppShell>
    </AuthGuard>
  );
}
