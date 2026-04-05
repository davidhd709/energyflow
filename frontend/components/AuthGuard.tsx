'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useSession } from '@/hooks/useSession';
import { Role } from '@/lib/types';

type Props = {
  allowedRoles: Role[];
  children: React.ReactNode;
};

function roleHome(role: Role): string {
  if (role === 'superadmin') return '/superadmin';
  if (role === 'admin') return '/admin';
  return '/operator';
}

export default function AuthGuard({ allowedRoles, children }: Props): React.ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const { session, loading } = useSession();
  const [allowed, setAllowed] = useState(false);

  const role = useMemo(() => session?.user.rol, [session]);

  useEffect(() => {
    if (loading) return;

    if (!session) {
      router.replace('/login');
      return;
    }

    if (!allowedRoles.includes(session.user.rol)) {
      router.replace(roleHome(session.user.rol));
      return;
    }

    setAllowed(true);
  }, [allowedRoles, loading, pathname, role, router, session]);

  if (loading || !allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-pine-800">
        Validando sesión...
      </div>
    );
  }

  return children;
}
