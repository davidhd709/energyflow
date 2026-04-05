'use client';

import { useEffect, useState } from 'react';

import { getSession } from '@/lib/auth';
import { SessionData } from '@/lib/types';

export function useSession(): {
  session: SessionData | null;
  loading: boolean;
} {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSession(getSession());
    setLoading(false);
  }, []);

  return { session, loading };
}
