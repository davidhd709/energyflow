import { NextRequest } from 'next/server';

function normalizeBaseUrl(value?: string): string {
  if (!value) return '';
  return value
    .replace(/^NEXT_PUBLIC_API_URL\s*=\s*/i, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\/+$/, '');
}

function buildTargetUrl(pathParts: string[], search: string): string {
  const backendBase = normalizeBaseUrl(process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL);
  if (!backendBase) {
    throw new Error('BACKEND_API_URL o NEXT_PUBLIC_API_URL no está configurada en el servidor frontend.');
  }
  const path = pathParts.join('/');
  return `${backendBase}/${path}${search}`;
}

async function handler(request: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const params = await context.params;
  const targetUrl = buildTargetUrl(params.path || [], request.nextUrl.search);

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  const method = request.method.toUpperCase();
  const body =
    method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? undefined : await request.arrayBuffer();

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');

  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };

