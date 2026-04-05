'use client';

import { useEffect, useState } from 'react';

import ActionFeedback from '@/components/ActionFeedback';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import MetricCard from '@/components/MetricCard';
import TableBlock from '@/components/TableBlock';
import { useCondominiumScope } from '@/hooks/useCondominiumScope';
import { useSession } from '@/hooks/useSession';
import { apiFetch } from '@/lib/api';
import { toCurrency, toNumber } from '@/lib/format';

type Period = {
  _id: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
};

type HouseInvoice = {
  _id: string;
  house_id: string;
  consumo_kwh: number;
  tarifa_kwh: number;
  valor_energia: number;
  valor_alumbrado: number;
  valor_aseo: number;
  total: number;
  pdf_url: string | null;
  estado_entrega: string;
};

type House = {
  _id: string;
  numero_casa: string;
};

type CalcResponse = {
  message: string;
  tarifa_kwh: number;
  total_energia: number;
  total_impuesto: number;
  total_facturado: number;
  warnings: {
    houses_without_consumption: string[];
  };
};

export default function LiquidationPage(): React.ReactNode {
  const { session } = useSession();
  const role = session?.user.rol;
  const canExecute = role === 'operador' || role === 'superadmin';
  const [periods, setPeriods] = useState<Period[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [invoices, setInvoices] = useState<HouseInvoice[]>([]);
  const [summary, setSummary] = useState<CalcResponse | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);

  const { condominiums, selectedCondominiumId, setSelectedCondominiumId, queryParam, ready } = useCondominiumScope(session);

  useEffect(() => {
    if (!session || !ready) return;
    Promise.all([apiFetch<Period[]>(`/billing-periods${queryParam}`), apiFetch<House[]>(`/houses${queryParam}`)])
      .then(([periodData, houseData]) => {
        setPeriods(periodData);
        setHouses(houseData);
        if (periodData.length > 0) setSelectedPeriod(periodData[0]._id);
      })
      .catch((err) => setError(err.message));
  }, [queryParam, ready, session]);

  useEffect(() => {
    if (!selectedPeriod) return;
    apiFetch<HouseInvoice[]>(`/billing/${selectedPeriod}/house-invoices`)
      .then(setInvoices)
      .catch(() => setInvoices([]));
  }, [selectedPeriod, summary]);

  const execute = async (): Promise<void> => {
    setError('');
    setSuccess('');
    setLoadingAction(true);
    try {
      const result = await apiFetch<CalcResponse>(`/billing/${selectedPeriod}/calculate`, {
        method: 'POST'
      });
      setSummary(result);
      const list = await apiFetch<HouseInvoice[]>(`/billing/${selectedPeriod}/house-invoices`);
      setInvoices(list);
      setSuccess('Liquidación ejecutada con éxito.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al liquidar');
    } finally {
      setLoadingAction(false);
    }
  };

  const houseById = Object.fromEntries(houses.map((house) => [house._id, house.numero_casa]));

  return (
    <AuthGuard allowedRoles={['superadmin', 'operador']}>
      <AppShell>
        <section className="space-y-6">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-700/70">Cálculo automático</p>
            <h2 className="font-[var(--font-title)] text-2xl text-pine-900 sm:text-3xl">Vista de liquidación</h2>
            <p className="max-w-3xl text-sm text-pine-800/80 sm:text-base">
              Ejecuta el cálculo de energía por casa y valida resultados antes de emitir facturas.
            </p>
          </header>
          <ActionFeedback
            loading={loadingAction}
            loadingText="Calculando consumo y facturación..."
            success={success}
            error={error}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Periodos" value={periods.length} />
            <MetricCard title="Casas" value={houses.length} />
            <MetricCard title="Facturas generadas" value={invoices.length} />
            <MetricCard title="Total liquidado" value={toCurrency(summary?.total_facturado || 0)} />
          </div>

          {role === 'superadmin' ? (
            <div className="soft-card max-w-md rounded-2xl p-4">
              <label className="text-sm text-pine-700">
                Condominio
                <select className="mt-1 w-full rounded border border-pine-300 px-3 py-2" value={selectedCondominiumId} onChange={(e) => setSelectedCondominiumId(e.target.value)}>
                  {condominiums.map((condo) => (
                    <option key={condo._id} value={condo._id}>
                      {condo.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="soft-card flex flex-wrap items-end gap-3 rounded-2xl p-4">
            <label className="text-sm text-pine-700">
              Periodo
              <select className="mt-1 rounded border border-pine-300 px-3 py-2" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                {periods.map((period) => (
                  <option key={period._id} value={period._id}>
                    {period.fecha_inicio} - {period.fecha_fin} ({period.estado})
                  </option>
                ))}
              </select>
            </label>
            {canExecute ? (
              <button className="rounded bg-pine-700 px-4 py-2 font-semibold text-white transition hover:bg-pine-800" onClick={execute}>
                {loadingAction ? 'Calculando...' : 'Ejecutar cálculo'}
              </button>
            ) : null}
          </div>

          {summary ? (
            <article className="soft-card grid gap-2 rounded-2xl p-4 text-sm md:grid-cols-2">
              <p>Tarifa kWh: {toCurrency(summary.tarifa_kwh)}</p>
              <p>Total energía: {toCurrency(summary.total_energia)}</p>
              <p>Total impuesto: {toCurrency(summary.total_impuesto)}</p>
              <p>Total facturado: {toCurrency(summary.total_facturado)}</p>
              <p className="md:col-span-2">Casas sin consumo: {summary.warnings.houses_without_consumption.join(', ') || 'Ninguna'}</p>
            </article>
          ) : null}

          <div className="soft-card rounded-2xl p-4 sm:p-5">
            <TableBlock
              columns={['Casa', 'Consumo kWh', 'Tarifa kWh', 'Energía', 'Impuesto', 'Aseo', 'Total', 'PDF']}
              rows={invoices.map((invoice) => ({
                Casa: houseById[invoice.house_id] || invoice.house_id,
                'Consumo kWh': toNumber(invoice.consumo_kwh),
                'Tarifa kWh': toCurrency(invoice.tarifa_kwh),
                Energía: toCurrency(invoice.valor_energia),
                Impuesto: toCurrency(invoice.valor_alumbrado),
                Aseo: toCurrency(invoice.valor_aseo),
                Total: toCurrency(invoice.total),
                PDF: invoice.pdf_url ? 'Generado' : 'Pendiente'
              }))}
            />
          </div>
        </section>
      </AppShell>
    </AuthGuard>
  );
}
