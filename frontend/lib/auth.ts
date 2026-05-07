import { apiFetch } from '@/lib/api';
import { SessionData, SessionUser } from '@/lib/types';

// La sesión vive en una cookie HttpOnly puesta por el backend en /auth/login.
// Localmente sólo cacheamos los datos de usuario para que el shell renderice
// rápido sin tener que esperar /auth/me en cada navegación.
const USER_CACHE_KEY = 'energyflow_user';

export function cacheUser(user: SessionUser): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // localStorage puede estar deshabilitado; no es crítico.
  }
}

export function getCachedUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function clearCachedUser(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(USER_CACHE_KEY);
    // Limpieza de claves heredadas del esquema con token en localStorage.
    localStorage.removeItem('energyflow_token');
  } catch {
    // ignore
  }
}

export async function fetchCurrentSession(): Promise<SessionData | null> {
  try {
    const user = await apiFetch<SessionUser>('/auth/me');
    cacheUser(user);
    return { user };
  } catch {
    clearCachedUser();
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<null>('/auth/logout', { method: 'POST' });
  } catch {
    // Aún si la llamada falla, dejamos limpia la caché local.
  }
  clearCachedUser();
}
