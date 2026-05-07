'use client';

import { useEffect, useState } from 'react';

import { fetchCurrentSession, getCachedUser } from '@/lib/auth';
import { SessionData } from '@/lib/types';

export function useSession(): {
  session: SessionData | null;
  loading: boolean;
} {
  // Render inicial usa caché local para que el shell se pinte rápido.
  // En segundo plano consultamos /auth/me para validar que la cookie sigue vigente.
  const [session, setSession] = useState<SessionData | null>(() => {
    const cached = getCachedUser();
    return cached ? { user: cached } : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentSession()
      .then((value) => {
        if (cancelled) return;
        setSession(value);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { session, loading };
}
