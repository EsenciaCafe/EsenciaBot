import { APP_JS, CONFIG_JS, INDEX_HTML, STYLES_CSS } from './assets.ts';

const PUBLIC_URL = 'https://tbqvypdxcgeofsmiqmuo.supabase.co/functions/v1/esencia-panel-web/';

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://telegram.org",
    "style-src 'self'",
    "connect-src 'self' https://tbqvypdxcgeofsmiqmuo.supabase.co",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'"
  ].join('; '),
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Robots-Tag': 'noindex, nofollow'
};

type Asset = {
  body: string;
  contentType: string;
  cacheControl: string;
};

function requestedAsset(pathname: string): Asset | null {
  if (pathname.endsWith('/styles.css')) {
    return { body: STYLES_CSS, contentType: 'text/css; charset=utf-8', cacheControl: 'public, max-age=300' };
  }
  if (pathname.endsWith('/config.js')) {
    return { body: CONFIG_JS, contentType: 'text/javascript; charset=utf-8', cacheControl: 'no-store' };
  }
  if (pathname.endsWith('/app.js')) {
    return { body: APP_JS, contentType: 'text/javascript; charset=utf-8', cacheControl: 'public, max-age=300' };
  }
  if (pathname.endsWith('/esencia-panel-web/') || pathname.endsWith('/index.html')) {
    return { body: INDEX_HTML, contentType: 'text/html; charset=utf-8', cacheControl: 'no-store' };
  }
  return null;
}

export function handlePanelWebRequest(request: Request): Response {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...SECURITY_HEADERS, 'Allow': 'GET, HEAD, OPTIONS' }
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Método no permitido.', {
      status: 405,
      headers: { ...SECURITY_HEADERS, 'Allow': 'GET, HEAD, OPTIONS' }
    });
  }

  const url = new URL(request.url);
  if (url.pathname.endsWith('/esencia-panel-web')) {
    return Response.redirect(PUBLIC_URL, 308);
  }

  const asset = requestedAsset(url.pathname);
  if (!asset) {
    return new Response('No encontrado.', { status: 404, headers: SECURITY_HEADERS });
  }

  return new Response(request.method === 'HEAD' ? null : asset.body, {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': asset.contentType,
      'Cache-Control': asset.cacheControl
    }
  });
}

Deno.serve(handlePanelWebRequest);
