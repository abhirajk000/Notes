import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side reverse proxy to the Go API.
 *
 * Browser → notes.abhiraj.xyz/api/* (same origin, no CORS)
 * Next.js server → BACKEND_URL/api/* (server-to-server)
 *
 * Set BACKEND_URL in Vercel (e.g. https://api.abhiraj.xyz).
 * Do NOT set NEXT_PUBLIC_API_URL in production — the client must use same-origin /api.
 */
function backendBase(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:4000'
  ).replace(/\/$/, '');
}

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await ctx.params;
  const target = `${backendBase()}/api/${path.join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const body = hasBody ? await req.text() : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Cannot reach the notes API. Deploy the Go backend on your VPS and set BACKEND_URL in Vercel.',
      },
      { status: 502 },
    );
  }

  const responseBody = await upstream.text();
  const response = new NextResponse(responseBody, {
    status: upstream.status,
    statusText: upstream.statusText,
  });

  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'set-cookie') return;
    if (lower === 'content-encoding') return;
    if (lower === 'transfer-encoding') return;
    response.headers.set(key, value);
  });

  const setCookies =
    typeof upstream.headers.getSetCookie === 'function'
      ? upstream.headers.getSetCookie()
      : [];
  for (const c of setCookies) {
    response.headers.append('set-cookie', c);
  }

  if (!response.headers.get('content-type')) {
    response.headers.set('content-type', 'application/json');
  }

  return response;
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
