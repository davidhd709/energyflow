'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import ActionFeedback from '@/components/ActionFeedback';
import { saveSession } from '@/lib/auth';
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
        {
          method: 'POST',
          body: JSON.stringify({ email, password })
        },
        false
      );

      saveSession({
        token: response.access_token,
        user: response.user
      });

      router.push(routeByRole(response.user.rol));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="relative mx-auto flex min-h-screen w-full max-w-[680px] items-center justify-center px-4 py-10 sm:px-6">
      <div className="absolute inset-0 -z-10 opacity-90">
        <div className="absolute -left-20 top-12 h-44 w-44 rounded-full bg-sky-200/60 blur-3xl" />
        <div className="absolute right-4 top-24 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl" />
      </div>

      <form onSubmit={submit} className="glass-card w-full rounded-3xl p-6 sm:p-8">
        <h1 className="text-center font-[var(--font-title)] text-4xl font-bold tracking-wide text-pine-900 sm:text-5xl">EnergyFlow</h1>

        <div className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-pine-800">
            Correo electrónico
            <input
              className="mt-1 w-full rounded-xl px-3 py-2.5"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
            />
          </label>
          <label className="block text-sm font-medium text-pine-800">
            Contraseña
            <input
              className="mt-1 w-full rounded-xl px-3 py-2.5"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
            />
          </label>
        </div>

        <div className="mt-4">
          <ActionFeedback loading={loading} loadingText="Validando credenciales..." error={error} />
        </div>

        <button
          className="mt-5 w-full rounded-xl bg-pine-700 px-4 py-2.5 font-semibold text-white transition hover:bg-pine-800 disabled:opacity-60"
          type="submit"
          disabled={loading}
        >
          {loading ? 'Ingresando...' : 'Entrar'}
        </button>
      </form>
    </section>
  );
}
