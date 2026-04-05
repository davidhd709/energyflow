'use client';

import { FormEvent, useEffect, useState } from 'react';

import ActionFeedback from '@/components/ActionFeedback';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import MetricCard from '@/components/MetricCard';
import TableBlock from '@/components/TableBlock';
import { apiFetch } from '@/lib/api';
import { Condominium, Role } from '@/lib/types';
import { toCurrency, toNumber } from '@/lib/format';

type DashboardPayload = {
  totals: {
    total_condominiums: number;
    total_houses: number;
    consumo_global: number;
    facturacion_global: number;
  };
  ranking_consumo: Array<{
    condominium_id: string;
    nombre: string;
    consumo_total: number;
    facturacion_total: number;
  }>;
};

type GlobalSettings = {
  default_porcentaje_alumbrado: number;
  default_email_soporte: string;
};

type UserRow = {
  _id: string;
  nombre: string;
  email: string;
  rol: Role;
  condominium_id?: string | null;
  activo?: boolean;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1')
  .replace(/^NEXT_PUBLIC_API_URL\s*=\s*/i, '')
  .replace(/^['"]|['"]$/g, '')
  .replace('/api/v1', '');

export default function SuperadminPage(): React.ReactNode {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [condominiums, setCondominiums] = useState<Condominium[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    default_porcentaje_alumbrado: 15,
    default_email_soporte: ''
  });
  const [refreshFlag, setRefreshFlag] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [logoFiles, setLogoFiles] = useState<Record<string, File | null>>({});
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const [condoForm, setCondoForm] = useState({
    nombre: '',
    direccion: '',
    porcentaje_alumbrado: 15,
    cuenta_bancaria: '',
    email_contacto: ''
  });

  const [userForm, setUserForm] = useState({
    nombre: '',
    email: '',
    password: '',
    rol: 'admin',
    condominium_id: ''
  });
  const [userEditForm, setUserEditForm] = useState({
    nombre: '',
    email: '',
    rol: 'admin' as Role,
    condominium_id: '',
    password: '',
    activo: true
  });

  useEffect(() => {
    const load = async (): Promise<void> => {
      const [dashboardData, condos, settingsData, usersData] = await Promise.all([
        apiFetch<DashboardPayload>('/metrics/superadmin/dashboard'),
        apiFetch<Condominium[]>('/condominiums'),
        apiFetch<GlobalSettings>('/settings/global'),
        apiFetch<UserRow[]>('/users')
      ]);
      setDashboard(dashboardData);
      setCondominiums(condos);
      setGlobalSettings(settingsData);
      setUsers(usersData);
    };

    load().catch((err) => setError(err.message));
  }, [refreshFlag]);

  const createCondominium = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoadingAction(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/condominiums', {
        method: 'POST',
        body: JSON.stringify(condoForm)
      });
      setCondoForm({
        nombre: '',
        direccion: '',
        porcentaje_alumbrado: 15,
        cuenta_bancaria: '',
        email_contacto: ''
      });
      setMessage('Condominio creado.');
      setRefreshFlag((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el condominio.');
    } finally {
      setLoadingAction(false);
    }
  };

  const uploadCondoLogo = async (condominiumId: string): Promise<void> => {
    const file = logoFiles[condominiumId];
    if (!file) {
      setMessage('Selecciona una imagen antes de subir el logo.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    setLoadingAction(true);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/condominiums/${condominiumId}/logo`, {
        method: 'POST',
        body: formData
      });

      setMessage('Logo actualizado correctamente.');
      setLogoFiles((current) => ({ ...current, [condominiumId]: null }));
      setRefreshFlag((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el logo.');
    } finally {
      setLoadingAction(false);
    }
  };

  const createUser = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const payload = {
      ...userForm,
      condominium_id: userForm.rol === 'superadmin' ? null : userForm.condominium_id
    };
    setLoadingAction(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setUserForm({
        nombre: '',
        email: '',
        password: '',
        rol: 'admin',
        condominium_id: ''
      });
      setMessage('Usuario creado.');
      setRefreshFlag((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario.');
    } finally {
      setLoadingAction(false);
    }
  };

  const startUserEdit = (user: UserRow): void => {
    setEditingUserId(user._id);
    setUserEditForm({
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      condominium_id: user.condominium_id || '',
      password: '',
      activo: user.activo ?? true
    });
  };

  const saveUserEdit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!editingUserId) return;

    const payload: Record<string, unknown> = {
      nombre: userEditForm.nombre,
      email: userEditForm.email,
      rol: userEditForm.rol,
      condominium_id: userEditForm.rol === 'superadmin' ? null : userEditForm.condominium_id,
      activo: userEditForm.activo
    };
    if (userEditForm.password.trim()) {
      payload.password = userEditForm.password.trim();
    }

    setLoadingAction(true);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/users/${editingUserId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      setMessage('Usuario actualizado.');
      setEditingUserId(null);
      setUserEditForm({
        nombre: '',
        email: '',
        rol: 'admin',
        condominium_id: '',
        password: '',
        activo: true
      });
      setRefreshFlag((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario.');
    } finally {
      setLoadingAction(false);
    }
  };

  const saveGlobalSettings = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoadingAction(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/settings/global', {
        method: 'PUT',
        body: JSON.stringify(globalSettings)
      });
      setMessage('Parámetros globales actualizados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los parámetros.');
    } finally {
      setLoadingAction(false);
    }
  };

  const resetDataKeepSuperadmin = async (): Promise<void> => {
    const ok = window.confirm(
      'Esto eliminará condominios, casas, periodos, lecturas, facturas y usuarios (excepto tu superadmin). ¿Deseas continuar?'
    );
    if (!ok) return;

    setLoadingAction(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/settings/reset-data', { method: 'POST' });
      setMessage('Base de datos limpiada: solo permanece el superadmin.');
      setRefreshFlag((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo limpiar la base de datos.');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <AuthGuard allowedRoles={['superadmin']}>
      <AppShell>
        <section className="space-y-6">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-700/70">Panel maestro</p>
            <h2 className="font-[var(--font-title)] text-2xl text-pine-900 sm:text-3xl">Dashboard Superadmin</h2>
            <p className="max-w-3xl text-sm text-pine-800/80 sm:text-base">
              Administra condominios, usuarios, configuración global y mantenimiento del sistema SaaS.
            </p>
          </header>
          <ActionFeedback
            loading={loadingAction}
            loadingText="Procesando administración del sistema..."
            success={message}
            error={error}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Condominios" value={dashboard?.totals.total_condominiums ?? 0} helper="Tenants registrados" />
            <MetricCard title="Casas activas" value={dashboard?.totals.total_houses ?? 0} />
            <MetricCard title="Consumo global (kWh)" value={toNumber(dashboard?.totals.consumo_global ?? 0)} />
            <MetricCard title="Facturación global" value={toCurrency(dashboard?.totals.facturacion_global ?? 0)} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="soft-card rounded-2xl p-4 sm:p-5">
              <h3 className="mb-3 text-lg font-bold text-pine-900">Ranking consumo por condominio</h3>
              <TableBlock
                columns={['Condominio', 'Consumo (kWh)', 'Facturación']}
                rows={(dashboard?.ranking_consumo || []).map((item) => ({
                  Condominio: item.nombre,
                  'Consumo (kWh)': toNumber(item.consumo_total),
                  Facturación: toCurrency(item.facturacion_total)
                }))}
              />
            </div>

            <div className="soft-card rounded-2xl p-4 sm:p-5">
              <h3 className="mb-3 text-lg font-bold text-pine-900">Crear condominio</h3>
              <form onSubmit={createCondominium} className="grid gap-3">
                <label className="text-sm text-pine-700">
                  Nombre condominio
                  <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" value={condoForm.nombre} onChange={(e) => setCondoForm({ ...condoForm, nombre: e.target.value })} required />
                </label>
                <label className="text-sm text-pine-700">
                  Dirección
                  <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" value={condoForm.direccion} onChange={(e) => setCondoForm({ ...condoForm, direccion: e.target.value })} required />
                </label>
                <label className="text-sm text-pine-700">
                  Cuenta bancaria
                  <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" value={condoForm.cuenta_bancaria} onChange={(e) => setCondoForm({ ...condoForm, cuenta_bancaria: e.target.value })} required />
                </label>
                <label className="text-sm text-pine-700">
                  Email contacto
                  <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="email" value={condoForm.email_contacto} onChange={(e) => setCondoForm({ ...condoForm, email_contacto: e.target.value })} required />
                </label>
                <label className="text-sm text-pine-700">
                  Porcentaje alumbrado
                  <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="number" step="0.01" min={0} value={condoForm.porcentaje_alumbrado} onChange={(e) => setCondoForm({ ...condoForm, porcentaje_alumbrado: Number(e.target.value) })} />
                </label>
                <button className="rounded bg-pine-700 px-4 py-2 font-semibold text-white" type="submit">
                  Guardar condominio
                </button>
              </form>
            </div>
          </div>

          <div className="soft-card rounded-2xl p-4 sm:p-5">
            <h3 className="mb-3 text-lg font-bold text-pine-900">Crear usuario</h3>
            <form onSubmit={createUser} className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-pine-700">
                Nombre
                <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" value={userForm.nombre} onChange={(e) => setUserForm({ ...userForm, nombre: e.target.value })} required />
              </label>
              <label className="text-sm text-pine-700">
                Email
                <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} required />
              </label>
              <label className="text-sm text-pine-700">
                Contraseña
                <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} required />
              </label>
              <label className="text-sm text-pine-700">
                Rol
                <select className="mt-1 w-full rounded border border-pine-300 px-3 py-2" value={userForm.rol} onChange={(e) => setUserForm({ ...userForm, rol: e.target.value })}>
                  <option value="admin">admin</option>
                  <option value="operador">operador</option>
                  <option value="superadmin">superadmin</option>
                </select>
              </label>
              <label className="text-sm text-pine-700 md:col-span-2">
                Condominio
                <select
                  className="mt-1 w-full rounded border border-pine-300 px-3 py-2"
                  value={userForm.condominium_id}
                  onChange={(e) => setUserForm({ ...userForm, condominium_id: e.target.value })}
                  disabled={userForm.rol === 'superadmin'}
                >
                  <option value="">Seleccionar condominio</option>
                  {condominiums.map((condo) => (
                    <option key={condo._id} value={condo._id}>
                      {condo.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <button className="rounded bg-pine-700 px-4 py-2 font-semibold text-white transition hover:bg-pine-800 md:col-span-2" type="submit">
                Crear usuario
              </button>
            </form>
          </div>

          <div className="soft-card rounded-2xl p-4 sm:p-5">
            <h3 className="mb-3 text-lg font-bold text-pine-900">Usuarios del sistema</h3>
            <TableBlock
              columns={['Nombre', 'Email', 'Rol', 'Condominio', 'Activo', 'Acción']}
              rows={users.map((user) => ({
                Nombre: user.nombre,
                Email: user.email,
                Rol: user.rol,
                Condominio: condominiums.find((item) => item._id === user.condominium_id)?.nombre || '-',
                Activo: user.activo === false ? 'No' : 'Sí',
                Acción: (
                  <button className="rounded bg-pine-700 px-2 py-1 text-xs text-white" type="button" onClick={() => startUserEdit(user)}>
                    Editar
                  </button>
                )
              }))}
            />
            {editingUserId ? (
              <form onSubmit={saveUserEdit} className="mt-4 grid gap-3 rounded-xl border border-pine-200/80 bg-white/70 p-4 md:grid-cols-2">
                <label className="text-sm text-pine-700">
                  Nombre
                  <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" value={userEditForm.nombre} onChange={(e) => setUserEditForm({ ...userEditForm, nombre: e.target.value })} required />
                </label>
                <label className="text-sm text-pine-700">
                  Email
                  <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="email" value={userEditForm.email} onChange={(e) => setUserEditForm({ ...userEditForm, email: e.target.value })} required />
                </label>
                <label className="text-sm text-pine-700">
                  Rol
                  <select className="mt-1 w-full rounded border border-pine-300 px-3 py-2" value={userEditForm.rol} onChange={(e) => setUserEditForm({ ...userEditForm, rol: e.target.value as Role })}>
                    <option value="admin">admin</option>
                    <option value="operador">operador</option>
                    <option value="superadmin">superadmin</option>
                  </select>
                </label>
                <label className="text-sm text-pine-700">
                  Condominio
                  <select
                    className="mt-1 w-full rounded border border-pine-300 px-3 py-2"
                    value={userEditForm.condominium_id}
                    onChange={(e) => setUserEditForm({ ...userEditForm, condominium_id: e.target.value })}
                    disabled={userEditForm.rol === 'superadmin'}
                  >
                    <option value="">Seleccionar condominio</option>
                    {condominiums.map((condo) => (
                      <option key={condo._id} value={condo._id}>
                        {condo.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-pine-700">
                  Nueva contraseña (opcional)
                  <input className="mt-1 w-full rounded border border-pine-300 px-3 py-2" type="password" value={userEditForm.password} onChange={(e) => setUserEditForm({ ...userEditForm, password: e.target.value })} />
                </label>
                <label className="flex items-center gap-2 rounded border border-pine-300 px-3 py-2 text-sm md:mt-6">
                  <input type="checkbox" checked={userEditForm.activo} onChange={(e) => setUserEditForm({ ...userEditForm, activo: e.target.checked })} />
                  Usuario activo
                </label>
                <button className="rounded bg-pine-700 px-4 py-2 font-semibold text-white transition hover:bg-pine-800 md:col-span-2" type="submit">
                  Guardar cambios usuario
                </button>
                <button
                  className="rounded border border-pine-300 bg-white px-4 py-2 font-semibold text-pine-700 transition hover:bg-pine-50 md:col-span-2"
                  type="button"
                  onClick={() => setEditingUserId(null)}
                >
                  Cancelar edición
                </button>
              </form>
            ) : null}
          </div>

          <div className="soft-card rounded-2xl p-4 sm:p-5">
            <h3 className="mb-3 text-lg font-bold text-pine-900">Logos de condominios</h3>
            <div className="space-y-3">
              {condominiums.length === 0 ? (
                <p className="text-sm text-pine-700">No hay condominios creados.</p>
              ) : (
                condominiums.map((condo) => (
                  <div key={condo._id} className="grid gap-3 rounded-xl border border-pine-200/80 bg-white/70 p-4 md:grid-cols-[220px_1fr_auto] md:items-center">
                    <div className="text-sm text-pine-800">
                      <p className="font-semibold">{condo.nombre}</p>
                      {condo.logo_url ? (
                        <a
                          className="text-xs text-pine-700 underline"
                          href={`${API_BASE}${condo.logo_url}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver logo actual
                        </a>
                      ) : (
                        <p className="text-xs text-pine-600">Sin logo cargado</p>
                      )}
                    </div>
                    <label className="text-sm text-pine-700">
                      Archivo logo (JPG, PNG, WEBP)
                      <input
                        className="mt-1 w-full rounded border border-pine-300 px-3 py-2"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) =>
                          setLogoFiles((current) => ({
                            ...current,
                            [condo._id]: e.target.files?.[0] || null
                          }))
                        }
                      />
                    </label>
                    <button className="rounded bg-pine-700 px-4 py-2 font-semibold text-white transition hover:bg-pine-800" type="button" onClick={() => uploadCondoLogo(condo._id)}>
                      Subir logo
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="soft-card rounded-2xl p-4 sm:p-5">
            <h3 className="mb-3 text-lg font-bold text-pine-900">Parámetros generales del sistema</h3>
            <form onSubmit={saveGlobalSettings} className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-pine-700">
                Porcentaje alumbrado por defecto
                <input
                  className="mt-1 w-full rounded border border-pine-300 px-3 py-2"
                  type="number"
                  min={0}
                  step="0.01"
                  value={globalSettings.default_porcentaje_alumbrado}
                  onChange={(e) =>
                    setGlobalSettings({
                      ...globalSettings,
                      default_porcentaje_alumbrado: Number(e.target.value)
                    })
                  }
                />
              </label>
              <label className="text-sm text-pine-700">
                Email soporte por defecto
                <input
                  className="mt-1 w-full rounded border border-pine-300 px-3 py-2"
                  type="email"
                  value={globalSettings.default_email_soporte}
                  onChange={(e) =>
                    setGlobalSettings({
                      ...globalSettings,
                      default_email_soporte: e.target.value
                    })
                  }
                />
              </label>
              <button className="rounded bg-pine-700 px-4 py-2 font-semibold text-white transition hover:bg-pine-800 md:col-span-2" type="submit">
                Guardar parámetros
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-red-200 bg-red-50/90 p-4 sm:p-5">
            <h3 className="mb-2 text-lg font-bold text-red-700">Zona de mantenimiento</h3>
            <p className="mb-3 text-sm text-red-700">
              Elimina todos los datos operativos y conserva solamente el superadmin actual.
            </p>
            <button className="rounded bg-red-600 px-4 py-2 font-semibold text-white transition hover:bg-red-700" type="button" onClick={resetDataKeepSuperadmin}>
              Limpiar base de datos (dejar solo superadmin)
            </button>
          </div>
        </section>
      </AppShell>
    </AuthGuard>
  );
}
