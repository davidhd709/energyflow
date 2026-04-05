'use client';

import { FormEvent, useEffect, useState } from 'react';

import ActionFeedback from '@/components/ActionFeedback';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import MetricCard from '@/components/MetricCard';
import { useCondominiumScope } from '@/hooks/useCondominiumScope';
import { useSession } from '@/hooks/useSession';
import { apiFetch } from '@/lib/api';
import { toCurrency, toNumber } from '@/lib/format';

type Period = {
  _id: string;
  fecha_inicio: string;
  fecha_fin: string;
};

type SupplierInvoice = {
  _id: string;
  consumo_total_kwh: number;
  valor_consumo_total: number;
  tarifa_kwh: number;
  valor_alumbrado_total: number;
  valor_aseo: number;
  total_factura: number;
};

export default function SupplierInvoicePage(): React.ReactNode {
  const { session } = useSession();
  const role = session?.user.rol;
  const readOnly = false;
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [currentInvoice, setCurrentInvoice] = useState<SupplierInvoice | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [form, setForm] = useState({
    consumo_total_kwh: 0,
    valor_consumo_total: 0,
    valor_alumbrado_total: 0,
    valor_aseo: 0,
    total_factura: 0
  });

  const { condominiums, selectedCondominiumId, setSelectedCondominiumId, queryParam, ready } = useCondominiumScope(session);

  useEffect(() => {
    if (!session || !ready) return;
    apiFetch<Period[]>(`/billing-periods${queryParam}`)
      .then((data) => {
        setPeriods(data);
        if (data.length > 0) setSelectedPeriod(data[0]._id);
      })
      .catch((err) => setError(err.message));
  }, [queryParam, ready, session]);

  useEffect(() => {
    if (!selectedPeriod) return;
    apiFetch<SupplierInvoice>(`/supplier-invoices?billing_period_id=${selectedPeriod}`)
      .then((invoice) => {
        setCurrentInvoice(invoice);
        setForm({
          consumo_total_kwh: invoice.consumo_total_kwh,
          valor_consumo_total: invoice.valor_consumo_total,
          valor_alumbrado_total: invoice.valor_alumbrado_total,
          valor_aseo: invoice.valor_aseo,
          total_factura: invoice.total_factura
        });
      })
      .catch(() => setCurrentInvoice(null));
  }, [selectedPeriod]);

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoadingAction(true);
    try {
      await apiFetch('/supplier-invoices', {
        method: 'PUT',
        body: JSON.stringify({
          billing_period_id: selectedPeriod,
          ...form
        })
      });
      const invoice = await apiFetch<SupplierInvoice>(`/supplier-invoices?billing_period_id=${selectedPeriod}`);
      setCurrentInvoice(invoice);
      setSuccess('Factura global guardada con éxito.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la factura global.');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <AuthGuard allowedRoles={['superadmin', 'operador']}>
      <AppShell>
        <section className="space-y-6">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-700/70">Entrada financiera</p>
            <h2 className="font-[var(--font-title)] text-2xl text-pine-900 sm:text-3xl">Carga de factura global</h2>
            <p className="max-w-3xl text-sm text-pine-800/80 sm:text-base">
              Registra la factura del proveedor para habilitar la liquidación por casa.
            </p>
          </header>
          <ActionFeedback
            loading={loadingAction}
            loadingText="Procesando factura global de energía..."
            success={success}
            error={error}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Periodos disponibles" value={periods.length} />
            <MetricCard title="Consumo global" value={`${toNumber(currentInvoice?.consumo_total_kwh || 0)} kWh`} />
            <MetricCard title="Tarifa kWh" value={toCurrency(currentInvoice?.tarifa_kwh || 0)} />
            <MetricCard title="Total factura" value={toCurrency(currentInvoice?.total_factura || 0)} />
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

          <div className="soft-card max-w-md rounded-2xl p-4">
            <label className="text-sm text-pine-700">
              Periodo
              <select className="mt-1 w-full rounded border border-pine-300 px-3 py-2" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                {periods.map((period) => (
                  <option key={period._id} value={period._id}>
                    {period.fecha_inicio} - {period.fecha_fin}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!readOnly ? (
            <form onSubmit={save} className="soft-card grid gap-3 rounded-2xl p-4 sm:p-5 md:grid-cols-2">
              <label className="text-sm text-pine-700">
                Consumo total kWh
                <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="number" min={0} step="0.01" value={form.consumo_total_kwh} onChange={(e) => setForm({ ...form, consumo_total_kwh: Number(e.target.value) })} required />
              </label>
              <label className="text-sm text-pine-700">
                Valor consumo total
                <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="number" min={0} step="0.01" value={form.valor_consumo_total} onChange={(e) => setForm({ ...form, valor_consumo_total: Number(e.target.value) })} required />
              </label>
              <label className="text-sm text-pine-700">
                Valor alumbrado total
                <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="number" min={0} step="0.01" value={form.valor_alumbrado_total} onChange={(e) => setForm({ ...form, valor_alumbrado_total: Number(e.target.value) })} required />
              </label>
              <label className="text-sm text-pine-700">
                Valor aseo
                <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="number" min={0} step="0.01" value={form.valor_aseo} onChange={(e) => setForm({ ...form, valor_aseo: Number(e.target.value) })} required />
              </label>
              <label className="text-sm text-pine-700 md:col-span-2">
                Total factura
                <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="number" min={0} step="0.01" value={form.total_factura} onChange={(e) => setForm({ ...form, total_factura: Number(e.target.value) })} required />
              </label>
              <button className="rounded bg-pine-700 px-4 py-2 font-semibold text-white transition hover:bg-pine-800 md:col-span-2" type="submit">
                {loadingAction ? 'Guardando...' : 'Guardar factura global'}
              </button>
            </form>
          ) : null}

          {currentInvoice ? (
            <article className="soft-card rounded-2xl p-4 text-sm sm:p-5">
              <h3 className="mb-2 text-lg font-semibold text-pine-900">Factura global cargada</h3>
              <p>Consumo total: {toNumber(currentInvoice.consumo_total_kwh)} kWh</p>
              <p>Valor consumo: {toCurrency(currentInvoice.valor_consumo_total)}</p>
              <p>Tarifa kWh: {toCurrency(currentInvoice.tarifa_kwh)}</p>
              <p>Aseo: {toCurrency(currentInvoice.valor_aseo)}</p>
              <p>Total factura: {toCurrency(currentInvoice.total_factura)}</p>
            </article>
          ) : (
            <p className="text-sm text-pine-700">No hay factura global para el periodo seleccionado.</p>
          )}
        </section>
      </AppShell>
    </AuthGuard>
  );
}
