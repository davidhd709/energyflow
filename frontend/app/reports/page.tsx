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

const REPORT_COLUMNS = [
  'Casa',
  'Serie medidor',
  'Serial nuevo',
  'Ubicación',
  'Lectura actual',
  'Lectura anterior',
  'Consumo kWh',
  'Fecha inicial',
  'Fecha final',
  'Días',
  'Valor kWh',
  'Consumo en pesos',
  'Impuesto alumbrado 15%',
  'Total factura'
] as const;

type Period = {
  _id: string;
  fecha_inicio: string;
  fecha_fin: string;
};

type House = {
  _id: string;
  numero_casa: string;
  nombre_usuario?: string;
};

type ReportPayload = {
  rows: Array<Record<(typeof REPORT_COLUMNS)[number], string | number>>;
  totals: {
    'Consumo kWh': number;
    'Consumo en pesos': number;
    'Impuesto alumbrado 15%': number;
    'Total factura': number;
  };
};

type HousesChartRow = {
  house_id: string;
  casa: string;
  nombre_usuario: string;
  consumo_kwh: number;
  total_factura: number;
  lectura_actual: number;
  lectura_anterior: number;
  foto_medidor_url: string;
};

type HousesChartPayload = {
  rows: HousesChartRow[];
};

type HouseHistoryPoint = {
  period_id: string;
  mes: string;
  consumo_kwh: number;
  total_factura: number;
  lectura_anterior: number;
  lectura_actual: number;
};

type HouseHistoryPayload = {
  house: House;
  history: HouseHistoryPoint[];
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

const periodSuffix = (fecha: string | undefined): string => {
  if (!fecha || fecha.length < 7) return '';
  return fecha.slice(0, 7).replace('-', '');
};

export default function ReportsPage(): React.ReactNode {
  const { session } = useSession();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [selectedHouseId, setSelectedHouseId] = useState('');
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [chartData, setChartData] = useState<HousesChartPayload | null>(null);
  const [houseHistory, setHouseHistory] = useState<HouseHistoryPayload | null>(null);
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
        if (periodData.length > 0) {
          setSelectedPeriod(periodData[0]._id);
        }
        if (houseData.length > 0) {
          setSelectedHouseId(houseData[0]._id);
        }
      })
      .catch((err) => setError(err.message));
  }, [queryParam, ready, session]);

  useEffect(() => {
    if (!selectedPeriod) return;
    apiFetch<ReportPayload>(`/reports/${selectedPeriod}/general`)
      .then(setReport)
      .catch((err) => setError(err.message));

    apiFetch<HousesChartPayload>(`/reports/${selectedPeriod}/houses-chart`)
      .then(setChartData)
      .catch(() => setChartData(null));
  }, [selectedPeriod]);

  useEffect(() => {
    if (!selectedPeriod || !selectedHouseId) return;
    apiFetch<HouseHistoryPayload>(`/reports/${selectedPeriod}/house-history?house_id=${selectedHouseId}`)
      .then(setHouseHistory)
      .catch(() => setHouseHistory(null));
  }, [selectedPeriod, selectedHouseId]);

  const runDownload = async (fn: () => Promise<void>, successText: string): Promise<void> => {
    setLoadingAction(true);
    setError('');
    setSuccess('');
    try {
      await fn();
      setSuccess(successText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    } finally {
      setLoadingAction(false);
    }
  };

  const downloadExcel = async (): Promise<void> => {
    if (!selectedPeriod) return;
    const selectedPeriodDoc = periods.find((item) => item._id === selectedPeriod);
    const suffix = periodSuffix(selectedPeriodDoc?.fecha_fin);
    await runDownload(async () => {
      const blob = await apiFetch<Blob>(`/reports/${selectedPeriod}/excel`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suffix ? `reportegeneral_${suffix}.xlsx` : 'reportegeneral.xlsx';
      anchor.click();
      URL.revokeObjectURL(url);
    }, 'Reporte general descargado en Excel.');
  };

  const downloadGeneralPdf = async (): Promise<void> => {
    if (!selectedPeriod) return;
    const selectedPeriodDoc = periods.find((item) => item._id === selectedPeriod);
    const suffix = periodSuffix(selectedPeriodDoc?.fecha_fin);
    await runDownload(async () => {
      const blob = await apiFetch<Blob>(`/reports/${selectedPeriod}/houses-pdf`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suffix ? `reportegeneral_${suffix}.pdf` : 'reportegeneral.pdf';
      anchor.click();
      URL.revokeObjectURL(url);
    }, 'Reporte general por casas descargado en PDF.');
  };

  const downloadIndividualPdf = async (): Promise<void> => {
    if (!selectedPeriod || !selectedHouseId) return;
    const selectedPeriodDoc = periods.find((item) => item._id === selectedPeriod);
    const selectedHouse = houses.find((item) => item._id === selectedHouseId);
    const houseName = houseSuffix(selectedHouse?.numero_casa || selectedHouseId);
    const suffix = periodSuffix(selectedPeriodDoc?.fecha_fin);
    await runDownload(async () => {
      const blob = await apiFetch<Blob>(`/reports/${selectedPeriod}/house-pdf?house_id=${selectedHouseId}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suffix ? `reportecasa${houseName}_${suffix}.pdf` : `reportecasa${houseName}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    }, 'Reporte individual por casa descargado en PDF.');
  };

  const rows = (report?.rows || []).map((item) => ({
    ...item,
    'Lectura actual': toNumber(Number(item['Lectura actual'] || 0)),
    'Lectura anterior': toNumber(Number(item['Lectura anterior'] || 0)),
    'Consumo kWh': toNumber(Number(item['Consumo kWh'] || 0)),
    'Valor kWh': toCurrency(Number(item['Valor kWh'] || 0)),
    'Consumo en pesos': toCurrency(Number(item['Consumo en pesos'] || 0)),
    'Impuesto alumbrado 15%': toCurrency(Number(item['Impuesto alumbrado 15%'] || 0)),
    'Total factura': toCurrency(Number(item['Total factura'] || 0))
  }));

  rows.push({
    Casa: 'TOTAL',
    'Serie medidor': '',
    'Serial nuevo': '',
    Ubicación: '',
    'Lectura actual': '',
    'Lectura anterior': '',
    'Consumo kWh': toNumber(report?.totals['Consumo kWh'] || 0),
    'Fecha inicial': '',
    'Fecha final': '',
    Días: '',
    'Valor kWh': '',
    'Consumo en pesos': toCurrency(report?.totals['Consumo en pesos'] || 0),
    'Impuesto alumbrado 15%': toCurrency(report?.totals['Impuesto alumbrado 15%'] || 0),
    'Total factura': toCurrency(report?.totals['Total factura'] || 0)
  });

  const generalRows = chartData?.rows || [];
  const maxGeneral = Math.max(...generalRows.map((row) => row.consumo_kwh), 1);
  const individualRows = houseHistory?.history || [];
  const maxIndividual = Math.max(...individualRows.map((row) => row.consumo_kwh), 1);

  return (
    <AuthGuard allowedRoles={['superadmin', 'admin', 'operador']}>
      <AppShell>
        <section className="space-y-6">
          <header>
            <h2 className="font-[var(--font-title)] text-3xl text-pine-900">Reportes de Energía</h2>
            <p className="mt-1 text-sm text-pine-700">Consulta comportamiento por casa y descarga reportes en PDF/Excel.</p>
          </header>

          <ActionFeedback
            loading={loadingAction}
            loadingText="Procesando energía del reporte..."
            success={success}
            error={error}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Consumo total periodo" value={`${toNumber(report?.totals['Consumo kWh'] || 0)} kWh`} />
            <MetricCard title="Consumo en pesos" value={toCurrency(report?.totals['Consumo en pesos'] || 0)} />
            <MetricCard title="Impuesto alumbrado" value={toCurrency(report?.totals['Impuesto alumbrado 15%'] || 0)} />
            <MetricCard title="Total facturado" value={toCurrency(report?.totals['Total factura'] || 0)} />
          </div>

          <div className="soft-card rounded-2xl p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-end">
              {session?.user.rol === 'superadmin' ? (
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

              <button className="rounded-xl bg-pine-700 px-4 py-2.5 font-semibold text-white" onClick={downloadExcel}>
                Descargar Excel
              </button>
              <button className="rounded-xl bg-olive px-4 py-2.5 font-semibold text-white" onClick={downloadGeneralPdf}>
                Descargar PDF general
              </button>
            </div>
          </div>

          <article className="soft-card rounded-2xl p-4 sm:p-5">
            <h3 className="mb-3 text-lg font-semibold text-pine-900">Consumo por casa (gráfica de barras)</h3>
            <div className="space-y-2">
              {generalRows.map((item) => {
                const width = `${Math.max(6, (item.consumo_kwh / maxGeneral) * 100)}%`;
                const displayName = item.nombre_usuario || `Casa ${item.casa}`;
                return (
                  <div key={item.house_id} className="grid grid-cols-[120px_minmax(0,1fr)_100px] items-center gap-2 text-sm sm:grid-cols-[170px_minmax(0,1fr)_120px]">
                    <span className="truncate text-pine-800">{displayName}</span>
                    <div className="h-4 overflow-hidden rounded-full border border-pine-200 bg-pine-50/80">
                      <div className="h-full rounded-full bg-gradient-to-r from-pine-600 to-olive" style={{ width }} />
                    </div>
                    <span className="text-right font-semibold text-pine-800">{item.consumo_kwh.toFixed(2)} kWh</span>
                  </div>
                );
              })}
              {!generalRows.length ? <p className="text-sm text-pine-700">No hay datos para graficar.</p> : null}
            </div>
          </article>

          <article className="soft-card rounded-2xl p-4 sm:p-5">
            <h3 className="mb-3 text-lg font-semibold text-pine-900">Reporte individual por casa (últimos 6 meses)</h3>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="text-sm text-pine-700">
                Casa
                <select className="mt-1 rounded-xl px-3 py-2.5" value={selectedHouseId} onChange={(e) => setSelectedHouseId(e.target.value)}>
                  {houses.map((house) => (
                    <option key={house._id} value={house._id}>
                      {house.numero_casa} {house.nombre_usuario ? `- ${house.nombre_usuario}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button className="rounded-xl bg-pine-700 px-4 py-2.5 font-semibold text-white" onClick={downloadIndividualPdf}>
                Descargar PDF individual
              </button>
            </div>

            <div className="space-y-2">
              {individualRows.map((item) => {
                const width = `${Math.max(8, (item.consumo_kwh / maxIndividual) * 100)}%`;
                return (
                  <div key={item.period_id} className="grid grid-cols-[86px_minmax(0,1fr)_100px] items-center gap-2 text-sm sm:grid-cols-[95px_minmax(0,1fr)_120px]">
                    <span className="text-pine-800">{item.mes}</span>
                    <div className="h-4 overflow-hidden rounded-full border border-pine-200 bg-pine-50/80">
                      <div className="h-full rounded-full bg-gradient-to-r from-pine-600 to-olive" style={{ width }} />
                    </div>
                    <span className="text-right font-semibold text-pine-800">{item.consumo_kwh.toFixed(2)} kWh</span>
                  </div>
                );
              })}
              {!individualRows.length ? <p className="text-sm text-pine-700">No hay datos históricos para esta casa.</p> : null}
            </div>
          </article>

          <TableBlock columns={[...REPORT_COLUMNS]} rows={rows} />
        </section>
      </AppShell>
    </AuthGuard>
  );
}
