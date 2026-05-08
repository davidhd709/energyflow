'use client';

import { useEffect, useMemo, useState } from 'react';

import ActionFeedback from '@/components/ActionFeedback';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import MetricCard from '@/components/MetricCard';
import TableBlock from '@/components/TableBlock';
import { Badge, Button, PageContainer, SectionHeader, StatusBadge } from '@/components/ui';
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
  saldo_anterior?: number;
  total_a_pagar?: number;
  pdf_url: string | null;
  estado_entrega: string;
  fecha_limite_pago?: string | null;
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

const formatDate = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CO');
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

  // Saldos en edición (estado local antes de hacer PATCH).
  const [saldoDrafts, setSaldoDrafts] = useState<Record<string, string>>({});
  const [savingSaldoId, setSavingSaldoId] = useState<string | null>(null);

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
      .then((data) => {
        setInvoices(data);
        // Sincroniza drafts con valores del backend.
        const drafts: Record<string, string> = {};
        for (const inv of data) {
          drafts[inv._id] = String(inv.saldo_anterior ?? 0);
        }
        setSaldoDrafts(drafts);
      })
      .catch(() => setInvoices([]));
  }, [selectedPeriod]);

  const reloadInvoices = async (): Promise<void> => {
    const updated = await apiFetch<HouseInvoice[]>(`/billing/${selectedPeriod}/house-invoices`);
    setInvoices(updated);
    const drafts: Record<string, string> = {};
    for (const inv of updated) {
      drafts[inv._id] = String(inv.saldo_anterior ?? 0);
    }
    setSaldoDrafts(drafts);
  };

  const saveSaldo = async (invoiceId: string): Promise<void> => {
    const raw = saldoDrafts[invoiceId];
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      setError('Saldo anterior inválido. Debe ser un número mayor o igual a 0.');
      return;
    }
    setSavingSaldoId(invoiceId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/billing/house-invoices/${invoiceId}/saldo-anterior`, {
        method: 'PATCH',
        body: JSON.stringify({ saldo_anterior: value })
      });
      await reloadInvoices();
      setSuccess('Saldo anterior actualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el saldo anterior.');
    } finally {
      setSavingSaldoId(null);
    }
  };

  const generateOne = async (invoiceId: string): Promise<void> => {
    setLoadingAction(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/billing/house-invoices/${invoiceId}/generate-pdf`, {
        method: 'POST'
      });
      await reloadInvoices();
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
      await reloadInvoices();
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
  const totalInvoiced = invoices.reduce(
    (acc, item) => acc + Number(item.total_a_pagar ?? item.total ?? 0),
    0
  );
  const totalSaldoPendiente = invoices.reduce(
    (acc, item) => acc + Number(item.saldo_anterior ?? 0),
    0
  );

  return (
    <AuthGuard allowedRoles={['superadmin', 'admin', 'operador']}>
      <AppShell>
        <PageContainer>
          <SectionHeader
            eyebrow="Facturación"
            title="Facturas PDF por casa"
            description="Captura saldos pendientes, genera y descarga recibos individuales con trazabilidad por periodo."
            actions={
              canGenerate ? (
                <Button onClick={generateAll} loading={loadingAction} disabled={!selectedPeriod || invoices.length === 0}>
                  Generar todos los PDFs
                </Button>
              ) : null
            }
          />

          <ActionFeedback
            loading={loadingAction}
            loadingText="Generando facturas de energía en PDF..."
            success={success}
            error={error}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Facturas del periodo" value={invoices.length} />
            <MetricCard title="Generadas" value={generatedCount} />
            <MetricCard title="Saldos pendientes" value={toCurrency(totalSaldoPendiente)} helper="Suma de saldos anteriores" />
            <MetricCard title="Total a pagar" value={toCurrency(totalInvoiced)} helper="Incluye saldo anterior" />
          </div>

          <div className="rounded-2xl border border-border-soft bg-white p-5 shadow-elevation-1">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
              {role === 'superadmin' ? (
                <label className="block text-sm font-medium text-ink-soft">
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

              <label className="block text-sm font-medium text-ink-soft">
                Periodo
                <select className="mt-1 w-full rounded-xl px-3 py-2.5" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                  {periods.map((period) => (
                    <option key={period._id} value={period._id}>
                      {period.fecha_inicio} - {period.fecha_fin}
                    </option>
                  ))}
                </select>
              </label>

              <Badge tone="neutral">
                {invoices.length} {invoices.length === 1 ? 'factura' : 'facturas'}
              </Badge>
            </div>
          </div>

          <TableBlock
            columns={
              canGenerate
                ? ['Casa', 'Consumo', 'Total periodo', 'Saldo anterior', 'Total a pagar', 'Vence', 'Estado', 'Acciones']
                : ['Casa', 'Consumo', 'Total periodo', 'Saldo anterior', 'Total a pagar', 'Vence', 'Estado', 'Acciones']
            }
            rows={invoices.map((invoice) => {
              const draft = saldoDrafts[invoice._id] ?? '0';
              const totalPagar = Number(invoice.total_a_pagar ?? invoice.total ?? 0);
              const isSaving = savingSaldoId === invoice._id;
              return {
                Casa: <span className="font-semibold text-ink">{houseById[invoice.house_id] || invoice.house_id}</span>,
                Consumo: `${toNumber(invoice.consumo_kwh)} kWh`,
                'Total periodo': toCurrency(invoice.total),
                'Saldo anterior': canGenerate ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={draft}
                      onChange={(e) => setSaldoDrafts((prev) => ({ ...prev, [invoice._id]: e.target.value }))}
                      className="w-28 rounded-lg border border-border-soft px-2.5 py-1.5 text-sm"
                      disabled={isSaving}
                    />
                    <Button size="sm" variant="secondary" onClick={() => saveSaldo(invoice._id)} loading={isSaving} disabled={isSaving || draft === String(invoice.saldo_anterior ?? 0)}>
                      Guardar
                    </Button>
                  </div>
                ) : (
                  toCurrency(invoice.saldo_anterior ?? 0)
                ),
                'Total a pagar': <span className="font-semibold text-brand-800">{toCurrency(totalPagar)}</span>,
                Vence: formatDate(invoice.fecha_limite_pago),
                Estado: <StatusBadge status={invoice.estado_entrega || 'pendiente'} />,
                Acciones: (
                  <div className="flex gap-2">
                    {canGenerate ? (
                      <Button size="sm" onClick={() => generateOne(invoice._id)} disabled={loadingAction}>
                        Generar
                      </Button>
                    ) : null}
                    {invoice.pdf_url ? (
                      <Button size="sm" variant="secondary" onClick={() => downloadOne(invoice)} disabled={loadingAction}>
                        Descargar
                      </Button>
                    ) : null}
                  </div>
                )
              };
            })}
          />
        </PageContainer>
      </AppShell>
    </AuthGuard>
  );
}
