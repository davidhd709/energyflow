import { getSession } from '@/lib/auth';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1').replace(/\/+$/, '');

function normalizeError(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object') return JSON.stringify(detail);
  return 'Error inesperado';
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true
): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (authenticated) {
    const session = getSession();
    if (session?.token) {
      headers.set('Authorization', `Bearer ${session.token}`);
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers
    });
  } catch {
    throw new Error(
      `No se pudo conectar al backend. Verifica NEXT_PUBLIC_API_URL y CORS_ORIGINS. API actual: ${API_URL}`
    );
  }

  if (!response.ok) {
    let detail: unknown = 'Error de API';
    try {
      const parsed = await response.json();
      detail = parsed.detail || parsed;
    } catch {
      detail = await response.text();
    }
    throw new Error(normalizeError(detail));
  }

  if (response.status === 204) {
    return null as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.blob()) as T;
}
