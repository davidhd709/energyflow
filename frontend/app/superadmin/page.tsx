'use client';

import { FormEvent, useEffect, useState } from 'react';

import ActionFeedback from '@/components/ActionFeedback';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import TableBlock from '@/components/TableBlock';
import { Badge, Button, EmptyState, PageContainer, SectionHeader, StatCard, StatusBadge } from '@/components/ui';
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

const Icons = {
  building: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M5.25 21V5.25A1.5 1.5 0 016.75 3.75h10.5a1.5 1.5 0 011.5 1.5V21M9 9h.008v.008H9V9zm0 3h.008v.008H9V12zm0 3h.008v.008H9V15zm6-6h.008v.008H15V9zm0 3h.008v.008H15V12zm0 3h.008v.008H15V15z" />
    </svg>
  ),
  homes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 21V9.75l7.5-5.25 7.5 5.25V21M9 21v-6h6v6" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L4 13h6l-1 9 9-11h-6l1-9z" />
    </svg>
  ),
  cash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75h19.5M2.25 12h19.5M2.25 5.25h19.5M9 8.25h.008m-.008 7.5h.008M15 8.25h.008m-.008 7.5h.008" />
    </svg>
  )
};

const inputClass =
  'mt-1 w-full rounded-xl border border-border-soft bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle';
const labelClass = 'block text-sm font-medium text-ink-soft';

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
  const [loadingData, setLoadingData] = useState(true);
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
      setLoadingData(true);
      try {
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos');
      } finally {
        setLoadingData(false);
      }
    };

    load();
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

  const totals = dashboard?.totals;

  return (
    <AuthGuard allowedRoles={['superadmin']}>
      <AppShell>
        <PageContainer>
          <SectionHeader
            eyebrow="Panel maestro"
            title="Dashboard Superadmin"
            description="Administra condominios, usuarios, configuración global y mantenimiento del sistema SaaS."
            actions={
              <Badge tone="brand" dot>
                {condominiums.length} {condominiums.length === 1 ? 'condominio' : 'condominios'}
              </Badge>
            }
          />

          <ActionFeedback
            loading={loadingAction}
            loadingText="Procesando administración del sistema..."
            success={message}
            error={error}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Condominios"
              value={loadingData ? '—' : totals?.total_condominiums ?? 0}
              helper="Tenants registrados"
              icon={Icons.building}
              tone="brand"
              loading={loadingData}
            />
            <StatCard
              label="Casas activas"
              value={loadingData ? '—' : totals?.total_houses ?? 0}
              icon={Icons.homes}
              tone="accent"
              loading={loadingData}
            />
            <StatCard
              label="Consumo global"
              value={loadingData ? '—' : `${toNumber(totals?.consumo_global ?? 0)} kWh`}
              icon={Icons.bolt}
              tone="warn"
              loading={loadingData}
            />
            <StatCard
              label="Facturación global"
              value={loadingData ? '—' : toCurrency(totals?.facturacion_global ?? 0)}
              icon={Icons.cash}
              tone="success"
              loading={loadingData}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-border-soft bg-white p-5 shadow-elevation-1 sm:p-6">
              <SectionHeader
                eyebrow="Performance"
                title="Ranking por consumo"
                description="Condominios con mayor consumo y facturación del periodo."
              />
              <div className="mt-5">
                {(dashboard?.ranking_consumo?.length ?? 0) === 0 && !loadingData ? (
                  <EmptyState
                    title="Sin datos de ranking"
                    description="Aparecerán cuando haya consumo registrado en algún condominio."
                    size="sm"
                  />
                ) : (
                  <TableBlock
                    columns={['Condominio', 'Consumo (kWh)', 'Facturación']}
                    rows={(dashboard?.ranking_consumo || []).map((item) => ({
                      Condominio: <span className="font-semibold text-ink">{item.nombre}</span>,
                      'Consumo (kWh)': toNumber(item.consumo_total),
                      Facturación: (
                        <span className="font-semibold text-brand-800">{toCurrency(item.facturacion_total)}</span>
                      )
                    }))}
                  />
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border-soft bg-white p-5 shadow-elevation-1 sm:p-6">
              <SectionHeader
                eyebrow="Onboarding"
                title="Crear condominio"
                description="Registra un nuevo tenant del sistema."
              />
              <form onSubmit={createCondominium} className="mt-5 grid gap-3">
                <label className={labelClass}>
                  Nombre condominio
                  <input className={inputClass} value={condoForm.nombre} onChange={(e) => setCondoForm({ ...condoForm, nombre: e.target.value })} required />
                </label>
                <label className={labelClass}>
                  Dirección
                  <input className={inputClass} value={condoForm.direccion} onChange={(e) => setCondoForm({ ...condoForm, direccion: e.target.value })} required />
                </label>
                <label className={labelClass}>
                  Cuenta bancaria
                  <input className={inputClass} value={condoForm.cuenta_bancaria} onChange={(e) => setCondoForm({ ...condoForm, cuenta_bancaria: e.target.value })} required />
                </label>
                <label className={labelClass}>
                  Email contacto
                  <input className={inputClass} type="email" value={condoForm.email_contacto} onChange={(e) => setCondoForm({ ...condoForm, email_contacto: e.target.value })} required />
                </label>
                <label className={labelClass}>
                  Porcentaje alumbrado (%)
                  <input className={inputClass} type="number" step="0.01" min={0} value={condoForm.porcentaje_alumbrado} onChange={(e) => setCondoForm({ ...condoForm, porcentaje_alumbrado: Number(e.target.value) })} />
                </label>
                <Button type="submit" loading={loadingAction}>
                  Guardar condominio
                </Button>
              </form>
            </section>
          </div>

          <section className="rounded-2xl border border-border-soft bg-white p-5 shadow-elevation-1 sm:p-6">
            <SectionHeader
              eyebrow="Usuarios"
              title="Crear usuario"
              description="Asigna roles y condominio cuando aplique."
            />
            <form onSubmit={createUser} className="mt-5 grid gap-3 md:grid-cols-2">
              <label className={labelClass}>
                Nombre
                <input className={inputClass} value={userForm.nombre} onChange={(e) => setUserForm({ ...userForm, nombre: e.target.value })} required />
              </label>
              <label className={labelClass}>
                Email
                <input className={inputClass} type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} required />
              </label>
              <label className={labelClass}>
                Contraseña
                <input className={inputClass} type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} required />
              </label>
              <label className={labelClass}>
                Rol
                <select className={inputClass} value={userForm.rol} onChange={(e) => setUserForm({ ...userForm, rol: e.target.value })}>
                  <option value="admin">Administrador</option>
                  <option value="operador">Operador</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </label>
              <label className={`${labelClass} md:col-span-2`}>
                Condominio
                <select
                  className={inputClass}
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
              <div className="md:col-span-2">
                <Button type="submit" loading={loadingAction} fullWidth>
                  Crear usuario
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-border-soft bg-white p-5 shadow-elevation-1 sm:p-6">
            <SectionHeader
              eyebrow="Administración"
              title="Usuarios del sistema"
              description="Gestiona accesos, roles y estado de cada usuario."
              actions={
                <Badge tone="neutral">
                  {users.length} {users.length === 1 ? 'usuario' : 'usuarios'}
                </Badge>
              }
            />
            <div className="mt-5">
              {users.length === 0 && !loadingData ? (
                <EmptyState title="Sin usuarios" description="Aún no hay usuarios registrados." size="sm" />
              ) : (
                <TableBlock
                  columns={['Nombre', 'Email', 'Rol', 'Condominio', 'Estado', 'Acción']}
                  rows={users.map((user) => ({
                    Nombre: <span className="font-semibold text-ink">{user.nombre}</span>,
                    Email: user.email,
                    Rol: <Badge tone={user.rol === 'superadmin' ? 'brand' : user.rol === 'admin' ? 'accent' : 'neutral'}>{user.rol}</Badge>,
                    Condominio: condominiums.find((item) => item._id === user.condominium_id)?.nombre || '—',
                    Estado: <StatusBadge status={user.activo === false ? 'inactivo' : 'activo'} />,
                    Acción: (
                      <Button size="sm" variant="secondary" onClick={() => startUserEdit(user)}>
                        Editar
                      </Button>
                    )
                  }))}
                />
              )}
            </div>

            {editingUserId ? (
              <form onSubmit={saveUserEdit} className="mt-6 grid gap-3 rounded-2xl border border-brand-200 bg-brand-50/40 p-5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700">Editando usuario</p>
                </div>
                <label className={labelClass}>
                  Nombre
                  <input className={inputClass} value={userEditForm.nombre} onChange={(e) => setUserEditForm({ ...userEditForm, nombre: e.target.value })} required />
                </label>
                <label className={labelClass}>
                  Email
                  <input className={inputClass} type="email" value={userEditForm.email} onChange={(e) => setUserEditForm({ ...userEditForm, email: e.target.value })} required />
                </label>
                <label className={labelClass}>
                  Rol
                  <select className={inputClass} value={userEditForm.rol} onChange={(e) => setUserEditForm({ ...userEditForm, rol: e.target.value as Role })}>
                    <option value="admin">Administrador</option>
                    <option value="operador">Operador</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </label>
                <label className={labelClass}>
                  Condominio
                  <select
                    className={inputClass}
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
                <label className={labelClass}>
                  Nueva contraseña (opcional)
                  <input className={inputClass} type="password" value={userEditForm.password} onChange={(e) => setUserEditForm({ ...userEditForm, password: e.target.value })} />
                </label>
                <label className="flex items-center gap-2 self-end rounded-xl border border-border-soft bg-white px-3 py-2.5 text-sm text-ink-soft">
                  <input type="checkbox" checked={userEditForm.activo} onChange={(e) => setUserEditForm({ ...userEditForm, activo: e.target.checked })} />
                  Usuario activo
                </label>
                <div className="md:col-span-2 flex flex-wrap gap-2">
                  <Button type="submit" loading={loadingAction}>
                    Guardar cambios
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditingUserId(null)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border-soft bg-white p-5 shadow-elevation-1 sm:p-6">
            <SectionHeader
              eyebrow="Branding"
              title="Logos de condominios"
              description="Carga los logos que se mostrarán en facturas y reportes PDF."
            />
            <div className="mt-5 space-y-3">
              {condominiums.length === 0 ? (
                <EmptyState title="Sin condominios creados" description="Primero crea un condominio para gestionar su logo." size="sm" />
              ) : (
                condominiums.map((condo) => (
                  <div
                    key={condo._id}
                    className="grid gap-3 rounded-2xl border border-border-soft bg-surface-subtle p-4 md:grid-cols-[240px_1fr_auto] md:items-center"
                  >
                    <div className="text-sm">
                      <p className="font-semibold text-ink">{condo.nombre}</p>
                      {condo.logo_url ? (
                        <a
                          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900"
                          href={`${API_BASE}${condo.logo_url}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver logo actual
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7m0-7L10 14m-7 0v7h7" />
                          </svg>
                        </a>
                      ) : (
                        <p className="text-xs text-ink-muted">Sin logo cargado</p>
                      )}
                    </div>
                    <label className={labelClass}>
                      Archivo logo (JPG, PNG, WEBP)
                      <input
                        className={inputClass}
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
                    <Button type="button" variant="secondary" onClick={() => uploadCondoLogo(condo._id)} loading={loadingAction}>
                      Subir logo
                    </Button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-border-soft bg-white p-5 shadow-elevation-1 sm:p-6">
            <SectionHeader
              eyebrow="Configuración"
              title="Parámetros generales del sistema"
              description="Valores por defecto al crear nuevos condominios."
            />
            <form onSubmit={saveGlobalSettings} className="mt-5 grid gap-3 md:grid-cols-2">
              <label className={labelClass}>
                Porcentaje alumbrado por defecto (%)
                <input
                  className={inputClass}
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
              <label className={labelClass}>
                Email soporte por defecto
                <input
                  className={inputClass}
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
              <div className="md:col-span-2">
                <Button type="submit" loading={loadingAction}>
                  Guardar parámetros
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-danger-200 bg-danger-50/50 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-danger-600 ring-1 ring-danger-200">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.5h.008M5.25 19.5h13.5a2.25 2.25 0 002.05-3.215L13.92 4.875a2.25 2.25 0 00-3.84 0L3.2 16.285A2.25 2.25 0 005.25 19.5z" />
                </svg>
              </span>
              <div className="flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-danger-700">Zona de mantenimiento</p>
                <h3 className="mt-1 text-base font-semibold text-danger-700">Limpiar base de datos</h3>
                <p className="mt-1.5 text-sm text-danger-700/85">
                  Elimina todos los datos operativos (condominios, casas, periodos, lecturas, facturas y usuarios) y conserva solamente el superadmin actual. Esta acción no se puede deshacer.
                </p>
                <div className="mt-4">
                  <Button type="button" variant="danger" onClick={resetDataKeepSuperadmin} loading={loadingAction}>
                    Limpiar base de datos
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </PageContainer>
      </AppShell>
    </AuthGuard>
  );
}
