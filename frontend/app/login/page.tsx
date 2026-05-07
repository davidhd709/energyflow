'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionFeedback from '@/components/ActionFeedback';
import { Button } from '@/components/ui';
import { cacheUser } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { SessionUser } from '@/lib/types';

type LoginResponse = {
  access_token: string;
  user: SessionUser;
};

function routeByRole(role: SessionUser['rol']): string {
  if (role === 'superadmin') return '/superadmin';
  if (role === 'admin') return '/admin';
  return '/operator';
}

export default function LoginPage(): React.ReactNode {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch<LoginResponse>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
        false
      );
      cacheUser(response.user);
      router.push(routeByRole(response.user.rol));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Panel branding (visible en lg+) */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 lg:flex">
        <div className="absolute inset-0 bg-grid-pattern opacity-20" aria-hidden="true" />
        <div
          className="absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-accent-400/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-40 -right-20 h-[520px] w-[520px] rounded-full bg-brand-500/30 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-white">
                <path
                  d="M13 2L4 13h6l-1 9 9-11h-6l1-9z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="0.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <p className="font-display text-xl font-bold tracking-tight">EnergyFlow</p>
              <p className="text-xs uppercase tracking-[0.18em] text-white/60">SaaS · Energy</p>
            </div>
          </div>

          <div className="space-y-6">
            <h1 className="font-display text-4xl font-bold leading-[1.1] xl:text-5xl">
              Gestión de energía,
              <br />
              <span className="bg-gradient-to-r from-accent-300 to-white bg-clip-text text-transparent">
                clara, medible y profesional.
              </span>
            </h1>
            <p className="max-w-md text-base leading-relaxed text-white/75">
              Lecturas, distribución de costos y reportes premium para condominios y propiedades. Toda la operación en un solo lugar.
            </p>

            <ul className="grid gap-3 text-sm text-white/85">
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success-500/20 text-success-400 ring-1 ring-success-400/30">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                Dashboard ejecutivo en tiempo real
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success-500/20 text-success-400 ring-1 ring-success-400/30">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                Liquidación automática por casa
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success-500/20 text-success-400 ring-1 ring-success-400/30">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                Reportes y facturas en PDF
              </li>
            </ul>
          </div>

          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} EnergyFlow · Todos los derechos reservados
          </p>
        </div>
      </aside>

      {/* Panel formulario */}
      <section className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:py-0">
        <div className="absolute inset-0 -z-10 bg-grid-pattern opacity-40 lg:hidden" aria-hidden="true" />

        <div className="w-full max-w-[440px] animate-fade-in-up">
          <div className="mb-8 text-center lg:hidden">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient shadow-elevation-3 ring-1 ring-white/30">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-white">
                <path
                  d="M13 2L4 13h6l-1 9 9-11h-6l1-9z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="0.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="font-display text-2xl font-bold text-ink">EnergyFlow</p>
            <p className="text-xs uppercase tracking-[0.18em] text-brand-600">SaaS · Energy</p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-7 shadow-elevation-3 sm:p-9">
            <header className="mb-7 space-y-1.5">
              <h2 className="font-display text-2xl font-bold text-ink sm:text-[28px]">
                Bienvenido de vuelta
              </h2>
              <p className="text-sm text-ink-muted">
                Ingresa tus credenciales para acceder al panel.
              </p>
            </header>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-ink-soft">
                  Correo electrónico
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0119.5 19.5h-15a2.25 2.25 0 01-2.25-2.25V6.75z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 7.5l9.5 6 9.5-6" />
                    </svg>
                  </span>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="tu@correo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-border-soft bg-white py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-ink-subtle"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-ink-soft">
                  Contraseña
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V7.125A4.875 4.875 0 0011.625 2.25 4.875 4.875 0 006.75 7.125v3.375M4.5 10.5h15a1.5 1.5 0 011.5 1.5v8.25a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 20.25V12a1.5 1.5 0 011.5-1.5z" />
                    </svg>
                  </span>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-border-soft bg-white py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-ink-subtle"
                  />
                </div>
              </div>

              <ActionFeedback loading={loading} loadingText="Validando credenciales..." error={error} />

              <Button type="submit" size="lg" fullWidth loading={loading} disabled={loading}>
                {loading ? 'Ingresando...' : 'Ingresar al panel'}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-ink-muted">
              Al ingresar aceptas los términos de uso del servicio.
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-ink-muted lg:hidden">
            © {new Date().getFullYear()} EnergyFlow
          </p>
        </div>
      </section>
    </div>
  );
}
