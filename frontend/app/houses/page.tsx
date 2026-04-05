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

type House = {
  _id: string;
  nombre_usuario: string;
  numero_casa: string;
  ubicacion: string;
  serie_medidor: string;
  serial_nuevo: string;
  tipo_medidor: string;
  es_zona_comun: boolean;
  activo: boolean;
};

export default function HousesPage(): React.ReactNode {
  const { session } = useSession();
  const role = session?.user.rol;
  const isReadOnly = false;
  const [houses, setHouses] = useState<House[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [refreshFlag, setRefreshFlag] = useState(0);
  const [editingHouseId, setEditingHouseId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre_usuario: '',
    numero_casa: '',
    ubicacion: '',
    serie_medidor: '',
    serial_nuevo: '',
    tipo_medidor: 'digital',
    es_zona_comun: false
  });

  const { condominiums, selectedCondominiumId, setSelectedCondominiumId, queryParam, ready } = useCondominiumScope(session);

  useEffect(() => {
    if (!session || !ready) return;
    apiFetch<House[]>(`/houses${queryParam}`)
      .then(setHouses)
      .catch((err) => setError(err.message));
  }, [queryParam, ready, refreshFlag, session]);

  const saveHouse = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoadingAction(true);
    setError('');
    setSuccess('');
    const payload: Record<string, unknown> = {
      ...form,
      condominium_id: role === 'superadmin' ? selectedCondominiumId : undefined
    };

    try {
      if (editingHouseId) {
        await apiFetch(`/houses/${editingHouseId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        setSuccess('Casa actualizada con éxito.');
      } else {
        await apiFetch('/houses', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        setSuccess('Casa registrada con éxito.');
      }

      setForm({
        nombre_usuario: '',
        numero_casa: '',
        ubicacion: '',
        serie_medidor: '',
        serial_nuevo: '',
        tipo_medidor: 'digital',
        es_zona_comun: false
      });
      setEditingHouseId(null);
      setRefreshFlag((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la casa.');
    } finally {
      setLoadingAction(false);
    }
  };

  const disableHouse = async (houseId: string): Promise<void> => {
    setLoadingAction(true);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/houses/${houseId}`, { method: 'DELETE' });
      setSuccess('Casa desactivada con éxito.');
      setRefreshFlag((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desactivar la casa.');
    } finally {
      setLoadingAction(false);
    }
  };

  const editHouse = (house: House): void => {
    setEditingHouseId(house._id);
    setForm({
      nombre_usuario: house.nombre_usuario || '',
      numero_casa: house.numero_casa,
      ubicacion: house.ubicacion,
      serie_medidor: house.serie_medidor,
      serial_nuevo: house.serial_nuevo,
      tipo_medidor: house.tipo_medidor,
      es_zona_comun: house.es_zona_comun
    });
  };

  const rows = useMemo(
    () =>
      houses.map((house) => ({
        Usuario: house.nombre_usuario || '-',
        Casa: house.numero_casa,
        Ubicación: house.ubicacion,
        'Serie medidor': house.serie_medidor,
        'Serial nuevo': house.serial_nuevo || '-',
        Tipo: house.tipo_medidor,
        'Zona común': house.es_zona_comun ? 'Sí' : 'No',
        Activo: house.activo ? 'Sí' : 'No',
        Acción: isReadOnly ? (
          '-'
        ) : (
          <div className="flex gap-2">
            <button type="button" className="rounded bg-pine-700 px-2 py-1 text-xs text-white" onClick={() => editHouse(house)}>
              Editar
            </button>
            <button type="button" className="rounded bg-red-600 px-2 py-1 text-xs text-white" onClick={() => disableHouse(house._id)}>
              Desactivar
            </button>
          </div>
        )
      })),
    [houses, isReadOnly]
  );

  const activeHouses = houses.filter((item) => item.activo).length;
  const commonHouses = houses.filter((item) => item.es_zona_comun && item.activo).length;

  return (
    <AuthGuard allowedRoles={['superadmin', 'operador']}>
      <AppShell>
        <section className="space-y-6">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-[var(--font-title)] text-3xl text-pine-900">Gestión de Casas</h2>
              <p className="mt-1 text-sm text-pine-700">Administra usuarios, medidores y zonas comunes del condominio.</p>
            </div>
          </header>

          <ActionFeedback
            loading={loadingAction}
            loadingText="Procesando registro de casa..."
            success={success}
            error={error}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard title="Casas registradas" value={houses.length} helper="Incluye activas e inactivas" />
            <MetricCard title="Casas activas" value={activeHouses} helper="Disponibles para lecturas y facturación" />
            <MetricCard title="Zonas comunes" value={commonHouses} helper="Unidades especiales activas" />
          </div>

          {role === 'superadmin' ? (
            <div className="soft-card max-w-md rounded-2xl p-4">
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
            </div>
          ) : null}

          {!isReadOnly ? (
            <form onSubmit={saveHouse} className="soft-card space-y-4 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-pine-900">{editingHouseId ? 'Editar casa' : 'Registrar nueva casa'}</h3>
                <span className="rounded-full bg-pine-100 px-3 py-1 text-xs font-semibold text-pine-700">Datos del medidor</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="text-sm text-pine-700">
                  Nombre usuario
                  <input className="mt-1 w-full rounded-xl px-3 py-2.5" value={form.nombre_usuario} onChange={(e) => setForm({ ...form, nombre_usuario: e.target.value })} />
                </label>
                <label className="text-sm text-pine-700">
                  Número casa
                  <input className="mt-1 w-full rounded-xl px-3 py-2.5" value={form.numero_casa} onChange={(e) => setForm({ ...form, numero_casa: e.target.value })} required />
                </label>
                <label className="text-sm text-pine-700">
                  Ubicación
                  <input className="mt-1 w-full rounded-xl px-3 py-2.5" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} required />
                </label>
                <label className="text-sm text-pine-700">
                  Serie medidor
                  <input className="mt-1 w-full rounded-xl px-3 py-2.5" value={form.serie_medidor} onChange={(e) => setForm({ ...form, serie_medidor: e.target.value })} required />
                </label>
                <label className="text-sm text-pine-700">
                  Serial nuevo
                  <input className="mt-1 w-full rounded-xl px-3 py-2.5" value={form.serial_nuevo} onChange={(e) => setForm({ ...form, serial_nuevo: e.target.value })} />
                </label>
                <label className="text-sm text-pine-700">
                  Tipo medidor
                  <select className="mt-1 w-full rounded-xl px-3 py-2.5" value={form.tipo_medidor} onChange={(e) => setForm({ ...form, tipo_medidor: e.target.value })}>
                    <option value="digital">Digital</option>
                    <option value="analogico">Analógico</option>
                  </select>
                </label>
              </div>

              <label className="inline-flex items-center gap-2 rounded-xl border border-pine-200 bg-white px-3 py-2 text-sm text-pine-800">
                <input type="checkbox" checked={form.es_zona_comun} onChange={(e) => setForm({ ...form, es_zona_comun: e.target.checked })} />
                Marcar como zona común
              </label>

              <div className="flex flex-wrap gap-2">
                <button className="rounded-xl bg-pine-700 px-4 py-2 font-semibold text-white" type="submit">
                  {editingHouseId ? 'Actualizar casa' : 'Guardar casa'}
                </button>
                {editingHouseId ? (
                  <button
                    type="button"
                    className="rounded-xl border border-pine-300 bg-white px-4 py-2 font-semibold text-pine-700"
                    onClick={() => {
                      setEditingHouseId(null);
                      setForm({
                        nombre_usuario: '',
                        numero_casa: '',
                        ubicacion: '',
                        serie_medidor: '',
                        serial_nuevo: '',
                        tipo_medidor: 'digital',
                        es_zona_comun: false
                      });
                    }}
                  >
                    Cancelar edición
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <TableBlock
            columns={['Usuario', 'Casa', 'Ubicación', 'Serie medidor', 'Serial nuevo', 'Tipo', 'Zona común', 'Activo', 'Acción']}
            rows={rows}
          />
        </section>
      </AppShell>
    </AuthGuard>
  );
}
