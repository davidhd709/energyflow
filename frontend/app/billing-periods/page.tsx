'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import ActionFeedback from '@/components/ActionFeedback';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import MetricCard from '@/components/MetricCard';
import TableBlock from '@/components/TableBlock';
import { useCondominiumScope } from '@/hooks/useCondominiumScope';
import { useSession } from '@/hooks/useSession';
import { apiFetch } from '@/lib/api';

type Period = {
  _id: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias: number;
  estado: string;
};

export default function BillingPeriodsPage(): React.ReactNode {
  const { session } = useSession();
  const role = session?.user.rol;
  const isSuperadmin = role === 'superadmin';
  const readOnly = false;
  const [periods, setPeriods] = useState<Period[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [refreshFlag, setRefreshFlag] = useState(0);
  const [form, setForm] = useState({ fecha_inicio: '', fecha_fin: '' });
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenPeriodId, setReopenPeriodId] = useState('');
  const [reopenReason, setReopenReason] = useState('');

  const { condominiums, selectedCondominiumId, setSelectedCondominiumId, queryParam, ready } = useCondominiumScope(session);

  useEffect(() => {
    if (!session || !ready) return;
    apiFetch<Period[]>(`/billing-periods${queryParam}`)
      .then(setPeriods)
      .catch((err) => setError(err.message));
  }, [queryParam, ready, refreshFlag, session]);

  const createPeriod = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoadingAction(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch('/billing-periods', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          condominium_id: role === 'superadmin' ? selectedCondominiumId : undefined
        })
      });
      setForm({ fecha_inicio: '', fecha_fin: '' });
      setSuccess('Periodo creado con éxito.');
      setRefreshFlag((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el periodo.');
    } finally {
      setLoadingAction(false);
    }
  };

  const closePeriod = async (periodId: string): Promise<void> => {
    setLoadingAction(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/billing-periods/${periodId}/close`, { method: 'POST' });
      setSuccess('Periodo cerrado con éxito.');
      setRefreshFlag((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar el periodo.');
    } finally {
      setLoadingAction(false);
    }
  };

  const openReopenModal = (periodId: string): void => {
    setReopenPeriodId(periodId);
    setReopenReason('');
    setReopenModalOpen(true);
  };

  const closeReopenModal = (force = false): void => {
    if (loadingAction && !force) return;
    setReopenModalOpen(false);
    setReopenPeriodId('');
    setReopenReason('');
  };

  const reopenPeriod = async (): Promise<void> => {
    const motivo = reopenReason.trim();
    if (!reopenPeriodId || motivo.length < 8) return;

    setLoadingAction(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/billing-periods/${reopenPeriodId}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ motivo })
      });
      setSuccess('Periodo reabierto con éxito.');
      setRefreshFlag((value) => value + 1);
      closeReopenModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reabrir el periodo.');
    } finally {
      setLoadingAction(false);
    }
  };

  const rows = useMemo(
    () =>
      periods.map((period) => ({
        Periodo: `${period.fecha_inicio} - ${period.fecha_fin}`,
        Días: period.dias,
        Estado: period.estado,
        Acción: readOnly ? (
          '-'
        ) : period.estado === 'cerrado' ? (
          isSuperadmin ? (
            <button className="rounded bg-amber-600 px-2 py-1 text-xs text-white transition hover:bg-amber-700" onClick={() => openReopenModal(period._id)}>
              Reabrir
            </button>
          ) : (
            '-'
          )
        ) : (
            <button className="rounded bg-pine-700 px-2 py-1 text-xs text-white transition hover:bg-pine-800" onClick={() => closePeriod(period._id)}>
              Cerrar
            </button>
          )
      })),
    [isSuperadmin, periods, readOnly]
  );

  return (
    <AuthGuard allowedRoles={['superadmin', 'operador']}>
      <AppShell>
        <section className="space-y-6">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-700/70">Gestión mensual</p>
            <h2 className="font-[var(--font-title)] text-2xl text-pine-900 sm:text-3xl">Periodos de facturación</h2>
            <p className="max-w-3xl text-sm text-pine-800/80 sm:text-base">
              Crea, controla y cierra periodos de lectura y facturación del condominio.
            </p>
          </header>
          <ActionFeedback
            loading={loadingAction}
            loadingText="Procesando periodo de energía..."
            success={success}
            error={error}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Total periodos" value={periods.length} />
            <MetricCard title="Abiertos" value={periods.filter((period) => period.estado === 'abierto').length} />
            <MetricCard title="Cerrados" value={periods.filter((period) => period.estado === 'cerrado').length} />
            <MetricCard title="Calculados" value={periods.filter((period) => period.estado === 'calculado').length} />
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

          {!readOnly ? (
            <form onSubmit={createPeriod} className="soft-card grid max-w-xl gap-3 rounded-2xl p-4 sm:p-5 md:grid-cols-2">
              <label className="text-sm text-pine-700">
                Fecha inicio
                <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} required />
              </label>
              <label className="text-sm text-pine-700">
                Fecha fin
                <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="date" value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} required />
              </label>
              <button className="rounded bg-pine-700 px-4 py-2 font-semibold text-white transition hover:bg-pine-800 md:col-span-2" type="submit">
                Crear periodo
              </button>
            </form>
          ) : null}

          <div className="soft-card rounded-2xl p-4 sm:p-5">
            <TableBlock columns={['Periodo', 'Días', 'Estado', 'Acción']} rows={rows} />
          </div>
        </section>

        {reopenModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
            <div className="w-full max-w-xl rounded-2xl border border-pine-200 bg-white p-5 shadow-2xl">
              <h3 className="font-[var(--font-title)] text-xl text-pine-900">Reabrir periodo cerrado</h3>
              <p className="mt-1 text-sm text-pine-700">
                Esta acción quedará registrada en auditoría. Debes indicar el motivo.
              </p>

              <label className="mt-4 block text-sm text-pine-700">
                Motivo de reapertura
                <textarea
                  className="mt-1 min-h-28 w-full rounded-xl border border-pine-300 px-3 py-2.5"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Ejemplo: Ajuste por error de lectura reportado por el operador."
                  maxLength={500}
                />
                <span className="mt-1 block text-xs text-pine-600">
                  Mínimo 8 caracteres. {reopenReason.trim().length}/500
                </span>
              </label>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-pine-300 px-4 py-2 text-sm font-semibold text-pine-800"
                  onClick={() => closeReopenModal()}
                  disabled={loadingAction}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={reopenPeriod}
                  disabled={loadingAction || reopenReason.trim().length < 8}
                >
                  {loadingAction ? 'Reabriendo...' : 'Confirmar reapertura'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </AppShell>
    </AuthGuard>
  );
}
