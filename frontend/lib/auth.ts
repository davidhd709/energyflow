import { SessionData } from '@/lib/types';

const TOKEN_KEY = 'energyflow_token';
const USER_KEY = 'energyflow_user';

export function saveSession(session: SessionData): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function getSession(): SessionData | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem(TOKEN_KEY);
  const userRaw = localStorage.getItem(USER_KEY);
  if (!token || !userRaw) return null;

  try {
    return {
      token,
      user: JSON.parse(userRaw)
    };
  } catch {
    return null;
  }
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
