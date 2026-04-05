'use client';

import { useEffect, useMemo, useState } from 'react';

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
};

type House = {
  _id: string;
  numero_casa: string;
};

type HouseInvoice = {
  _id: string;
  house_id: string;
  consumo_kwh: number;
  total: number;
  pdf_url: string | null;
  estado_entrega: string;
};

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const houseSuffix = (numeroCasa: string): string => {
  const cleaned = slug(numeroCasa);
  if (cleaned.startsWith('casa') && cleaned.length > 4) {
    return cleaned.slice(4);
  }
  if (cleaned === 'zonascomunes' || cleaned === 'zonacomun') {
    return 'zonascomunes';
  }
  return cleaned || 'sinid';
};

export default function PdfsPage(): React.ReactNode {
  const { session } = useSession();
  const role = session?.user.rol;
  const canGenerate = role === 'superadmin' || role === 'operador';
  const [periods, setPeriods] = useState<Period[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [invoices, setInvoices] = useState<HouseInvoice[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
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
  }, [selectedPeriod]);

  const generateOne = async (invoiceId: string): Promise<void> => {
    setLoadingAction(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/billing/house-invoices/${invoiceId}/generate-pdf`, {
        method: 'POST'
      });
      const updated = await apiFetch<HouseInvoice[]>(`/billing/${selectedPeriod}/house-invoices`);
      setInvoices(updated);
      setSuccess('Factura PDF generada con éxito.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el PDF.');
    } finally {
      setLoadingAction(false);
    }
  };

  const generateAll = async (): Promise<void> => {
    setLoadingAction(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/billing/${selectedPeriod}/generate-all-pdfs`, { method: 'POST' });
      const updated = await apiFetch<HouseInvoice[]>(`/billing/${selectedPeriod}/house-invoices`);
      setInvoices(updated);
      setSuccess('Todas las facturas PDF se generaron correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron generar los PDFs.');
    } finally {
      setLoadingAction(false);
    }
  };

  const houseById = useMemo(() => Object.fromEntries(houses.map((house) => [house._id, house.numero_casa])), [houses]);

  const downloadOne = async (invoice: HouseInvoice): Promise<void> => {
    setLoadingAction(true);
    setError('');
    setSuccess('');
    try {
      const blob = await apiFetch<Blob>(`/billing/house-invoices/${invoice._id}/download`);
      const fileUrl = URL.createObjectURL(blob);
      const houseLabel = houseById[invoice.house_id] || invoice.house_id;
      const anchor = document.createElement('a');
      anchor.href = fileUrl;
      anchor.download = `energiacasa${houseSuffix(String(houseLabel))}.pdf`;
      anchor.click();
      URL.revokeObjectURL(fileUrl);
      setSuccess('Factura descargada con éxito.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo descargar la factura.');
    } finally {
      setLoadingAction(false);
    }
  };

  const generatedCount = invoices.filter((item) => item.estado_entrega === 'generado').length;
  const pendingCount = invoices.length - generatedCount;
  const totalInvoiced = invoices.reduce((acc, item) => acc + Number(item.total || 0), 0);

  return (
    <AuthGuard allowedRoles={['superadmin', 'admin', 'operador']}>
      <AppShell>
        <section className="space-y-6">
          <header>
            <h2 className="font-[var(--font-title)] text-3xl text-pine-900">Facturación PDF por Casa</h2>
            <p className="mt-1 text-sm text-pine-700">Genera y descarga recibos individuales con trazabilidad por periodo.</p>
          </header>

          <ActionFeedback
            loading={loadingAction}
            loadingText="Generando facturas de energía en PDF..."
            success={success}
            error={error}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Facturas del periodo" value={invoices.length} />
            <MetricCard title="Generadas" value={generatedCount} />
            <MetricCard title="Pendientes" value={pendingCount} />
            <MetricCard title="Total facturado" value={toCurrency(totalInvoiced)} />
          </div>

          <div className="soft-card rounded-2xl p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
              {role === 'superadmin' ? (
                <label className="text-sm text-pine-700">
                  Condominio
                  <select className="mt-1 w-full rounded-xl px-3 py-2.5" value={selectedCondominiumId} onChange={(e) => setSelectedCondominiumId(e.target.value)}>
                    {condominiums.map((condo) => (
                      <option key={condo._id} value={condo._id}>
                        {condo.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="text-sm text-pine-700">
                Periodo
                <select className="mt-1 w-full rounded-xl px-3 py-2.5" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                  {periods.map((period) => (
                    <option key={period._id} value={period._id}>
                      {period.fecha_inicio} - {period.fecha_fin}
                    </option>
                  ))}
                </select>
              </label>

              {canGenerate ? (
                <button className="rounded-xl bg-pine-700 px-4 py-2.5 font-semibold text-white" onClick={generateAll}>
                  {loadingAction ? 'Generando...' : 'Generar todos los PDFs'}
                </button>
              ) : null}
            </div>
          </div>

          <TableBlock
            columns={['Casa', 'Consumo', 'Total', 'Estado', 'Acciones']}
            rows={invoices.map((invoice) => ({
              Casa: houseById[invoice.house_id] || invoice.house_id,
              Consumo: `${toNumber(invoice.consumo_kwh)} kWh`,
              Total: toCurrency(invoice.total),
              Estado: invoice.estado_entrega,
              Acciones: (
                <div className="flex gap-2">
                  {canGenerate ? (
                    <button className="rounded-xl bg-pine-700 px-2.5 py-1.5 text-xs font-semibold text-white" onClick={() => generateOne(invoice._id)} disabled={loadingAction}>
                      Generar
                    </button>
                  ) : null}
                  {invoice.pdf_url ? (
                    <button
                      className="rounded-xl bg-olive px-2.5 py-1.5 text-xs font-semibold text-white"
                      onClick={() => downloadOne(invoice)}
                      disabled={loadingAction}
                    >
                      Descargar
                    </button>
                  ) : (
                    <span>-</span>
                  )}
                </div>
              )
            }))}
          />
        </section>
      </AppShell>
    </AuthGuard>
  );
}
