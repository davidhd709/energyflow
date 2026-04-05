'use client';

import { FormEvent, useMemo, useState } from 'react';

import ActionFeedback from '@/components/ActionFeedback';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import MetricCard from '@/components/MetricCard';
import TableBlock from '@/components/TableBlock';
import { useCondominiumScope } from '@/hooks/useCondominiumScope';
import { useSession } from '@/hooks/useSession';
import { apiFetch } from '@/lib/api';
import { toCurrency, toNumber } from '@/lib/format';

type ImportResult = {
  file: string;
  periodo: string;
  casas: number;
  consumo_total_kwh: number;
  total_factura: number;
  dry_run: boolean;
};

type ImportResponse = {
  message: string;
  dry_run: boolean;
  omit_common_zones?: boolean;
  processed: number;
  results: ImportResult[];
  errors: Array<{ file: string; error: string }>;
};

export default function ImportsPage(): React.ReactNode {
  const { session } = useSession();
  const role = session?.user.rol;
  const [files, setFiles] = useState<File[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [omitCommonZones, setOmitCommonZones] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [response, setResponse] = useState<ImportResponse | null>(null);

  const { condominiums, selectedCondominiumId, setSelectedCondominiumId, ready } = useCondominiumScope(session);
  const canSubmit = useMemo(() => files.length > 0 && (role !== 'superadmin' || Boolean(selectedCondominiumId)), [files.length, role, selectedCondominiumId]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;

    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    form.append('dry_run', String(dryRun));
    form.append('omit_common_zones', String(omitCommonZones));
    if (role === 'superadmin') {
      form.append('condominium_id', selectedCondominiumId);
    }

    setLoadingAction(true);
    setSuccess('');
    setError('');
    setResponse(null);

    try {
      const payload = await apiFetch<ImportResponse>('/imports/historical-excel', {
        method: 'POST',
        body: form
      });
      setResponse(payload);
      setSuccess(dryRun ? 'Validación completada. Revisa los resultados.' : 'Importación ejecutada correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo importar el Excel.');
    } finally {
      setLoadingAction(false);
    }
  };

  const resultRows = (response?.results || []).map((item) => ({
    Archivo: item.file,
    Periodo: item.periodo,
    Casas: item.casas,
    'Consumo total': `${toNumber(item.consumo_total_kwh)} kWh`,
    'Total factura': toCurrency(item.total_factura),
    Modo: item.dry_run ? 'Validación' : 'Importado'
  }));

  const errorRows = (response?.errors || []).map((item) => ({
    Archivo: item.file,
    Error: item.error
  }));

  return (
    <AuthGuard allowedRoles={['superadmin', 'operador']}>
      <AppShell>
        <section className="space-y-6">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-700/70">Carga histórica</p>
            <h2 className="font-[var(--font-title)] text-2xl text-pine-900 sm:text-3xl">Importación histórica Excel</h2>
            <p className="max-w-3xl text-sm text-pine-800/80 sm:text-base">
              Carga archivos mensuales desde Excel, valida formato y registra datos masivos en el sistema.
            </p>
          </header>
          <ActionFeedback
            loading={loadingAction}
            loadingText="Procesando archivos de energía..."
            success={success}
            error={error}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Archivos seleccionados" value={files.length} />
            <MetricCard title="Resultados procesados" value={response?.processed || 0} />
            <MetricCard title="Con errores" value={response?.errors.length || 0} />
            <MetricCard title="Modo actual" value={dryRun ? 'Validación' : 'Importación'} />
          </div>

          <form onSubmit={submit} className="soft-card space-y-4 rounded-2xl p-4 sm:p-5">
            {role === 'superadmin' ? (
              <label className="block max-w-sm text-sm text-pine-700">
                Condominio
                <select
                  className="mt-1 w-full rounded border border-pine-300 px-3 py-2"
                  value={selectedCondominiumId}
                  onChange={(e) => setSelectedCondominiumId(e.target.value)}
                  disabled={!ready}
                >
                  {condominiums.map((condo) => (
                    <option key={condo._id} value={condo._id}>
                      {condo.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block text-sm text-pine-700">
              Archivos Excel (.xlsx) desde enero 2024 hasta la fecha
              <input
                className="mt-1 w-full rounded border border-pine-300 bg-white px-3 py-2"
                type="file"
                accept=".xlsx"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-pine-700">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
              />
              Ejecutar primero en modo validación (no guarda datos)
            </label>

            <label className="flex items-center gap-2 text-sm text-pine-700">
              <input
                type="checkbox"
                checked={omitCommonZones}
                onChange={(e) => setOmitCommonZones(e.target.checked)}
              />
              Omitir "Zonas comunes" y cargar solo casas
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="rounded bg-pine-700 px-4 py-2 font-semibold text-white transition hover:bg-pine-800"
                disabled={!canSubmit || loadingAction}
              >
                {loadingAction ? 'Procesando...' : dryRun ? 'Validar archivos' : 'Importar archivos'}
              </button>
              <span className="text-sm text-pine-700">
                {files.length ? `${files.length} archivo(s) seleccionado(s)` : 'Sin archivos seleccionados'}
              </span>
            </div>
          </form>

          {resultRows.length ? (
            <div className="soft-card rounded-2xl p-4 sm:p-5">
              <TableBlock
                columns={['Archivo', 'Periodo', 'Casas', 'Consumo total', 'Total factura', 'Modo']}
                rows={resultRows}
              />
            </div>
          ) : null}

          {errorRows.length ? (
            <div className="soft-card rounded-2xl p-4 sm:p-5">
              <TableBlock
                columns={['Archivo', 'Error']}
                rows={errorRows}
              />
            </div>
          ) : null}
        </section>
      </AppShell>
    </AuthGuard>
  );
}
