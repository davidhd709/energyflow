'use client';

import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { Condominium, SessionData } from '@/lib/types';

export function useCondominiumScope(session: SessionData | null): {
  condominiums: Condominium[];
  selectedCondominiumId: string;
  setSelectedCondominiumId: (value: string) => void;
  queryParam: string;
  ready: boolean;
} {
  const [condominiums, setCondominiums] = useState<Condominium[]>([]);
  const [selectedCondominiumId, setSelectedCondominiumId] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!session) return;

    if (session.user.rol !== 'superadmin') {
      setReady(true);
      return;
    }

    apiFetch<Condominium[]>('/condominiums')
      .then((items) => {
        setCondominiums(items);
        if (items.length > 0) {
          setSelectedCondominiumId(items[0]._id);
        }
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [session]);

  const queryParam = useMemo(() => {
    if (!session || session.user.rol !== 'superadmin') return '';
    return selectedCondominiumId ? `?condominium_id=${selectedCondominiumId}` : '';
  }, [selectedCondominiumId, session]);

  return {
    condominiums,
    selectedCondominiumId,
    setSelectedCondominiumId,
    queryParam,
    ready
  };
}
