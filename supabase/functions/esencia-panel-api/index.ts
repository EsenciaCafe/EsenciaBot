// API de solo lectura para el panel independiente de Esencia.
import {
  loadModifierAnalysis,
  loadVoidHistory,
  loadWebOverview,
  validateTelegramWebAppData
} from '../telegram-sales-bot/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SUPABASE_SECRET_KEYS = Deno.env.get('SUPABASE_SECRET_KEYS') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SUPABASE_PUBLISHABLE_KEYS = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '';

type JsonRecord = Record<string, unknown>;
type WebIdentity = {
  kind: 'telegram' | 'account';
  userId: string;
  user: JsonRecord;
};

function namedEnvironmentKey(raw: string, name = 'default') {
  try {
    const values = JSON.parse(raw) as Record<string, string>;
    return String(values?.[name] || '');
  } catch {
    return '';
  }
}

const SUPABASE_SERVER_KEY = namedEnvironmentKey(SUPABASE_SECRET_KEYS) ||
  SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_PUBLIC_KEY = namedEnvironmentKey(SUPABASE_PUBLISHABLE_KEYS) ||
  SUPABASE_ANON_KEY;

function supabaseApiHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith('sb_secret_') && !key.startsWith('sb_publishable_')) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });
}

export async function validateWebAccount(request: Request): Promise<WebIdentity> {
  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!SUPABASE_PUBLIC_KEY || !accessToken || accessToken.length > 4096) {
    throw new Error('Inicia sesión para consultar el panel.');
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      ...supabaseApiHeaders(SUPABASE_PUBLIC_KEY),
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) throw new Error('La sesión ha caducado. Vuelve a iniciar sesión.');
  const user = await response.json() as JsonRecord;
  const appMetadata = (user.app_metadata || {}) as JsonRecord;
  if (appMetadata.esencia_panel !== true) {
    throw new Error('Esta cuenta no tiene permiso para consultar el panel.');
  }
  return { kind: 'account', userId: String(user.id || ''), user };
}

async function webIdentity(request: Request, body: JsonRecord): Promise<WebIdentity> {
  const initData = String(body.initData || '');
  if (initData) {
    const identity = await validateTelegramWebAppData(initData);
    return { kind: 'telegram', ...identity };
  }
  return await validateWebAccount(request);
}

export async function configureWebAccount(
  identity: WebIdentity,
  rawEmail: unknown,
  rawPassword: unknown
) {
  if (identity.kind !== 'telegram') {
    throw new Error('La cuenta web solo puede configurarse desde el bot de Telegram.');
  }
  const email = String(rawEmail || '').trim().toLowerCase();
  const password = String(rawPassword || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Escribe un correo electrónico válido.');
  }
  if (password.length < 10 || password.length > 128) {
    throw new Error('La contraseña debe tener entre 10 y 128 caracteres.');
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      ...supabaseApiHeaders(SUPABASE_SERVER_KEY),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        esencia_panel: true,
        telegram_user_id: identity.userId
      }
    })
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({})) as JsonRecord;
    const message = String(details.message || details.msg || '').toLowerCase();
    if (response.status === 422 || message.includes('already') || message.includes('registered')) {
      throw new Error('Ese correo ya tiene una cuenta. Prueba a iniciar sesión o utiliza otro correo.');
    }
    console.error('[esencia-panel-api] No se pudo configurar la cuenta', response.status, details);
    throw new Error('No se pudo crear la cuenta web. Inténtalo de nuevo.');
  }
  const account = await response.json() as JsonRecord;
  return { id: String(account.id || ''), email: String(account.email || email) };
}

export async function handlePanelRequest(request: Request) {
  if (request.method === 'OPTIONS') return jsonResponse({ ok: true });
  if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Método no permitido.' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVER_KEY || !SUPABASE_PUBLIC_KEY) {
    return jsonResponse({ ok: false, error: 'Panel no configurado.' }, 503);
  }

  let body: JsonRecord;
  try {
    body = await request.json() as JsonRecord;
  } catch {
    return jsonResponse({ ok: false, error: 'JSON no válido.' }, 400);
  }
  if (body.type !== 'web_app') {
    return jsonResponse({ ok: false, error: 'Solicitud no reconocida.' }, 400);
  }

  let identity: WebIdentity;
  try {
    identity = await webIdentity(request, body);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Acceso no autorizado.'
    }, 401);
  }

  try {
    const action = String(body.action || 'overview');
    if (action === 'configure_web_account') {
      return jsonResponse({
        ok: true,
        data: await configureWebAccount(identity, body.email, body.password)
      });
    }
    if (action === 'overview') {
      return jsonResponse({
        ok: true,
        user: {
          id: identity.userId,
          firstName: String(identity.user.first_name || '').slice(0, 80),
          access: identity.kind
        },
        data: await loadWebOverview(body.period, body.from, body.to)
      });
    }
    if (action === 'void_history') {
      return jsonResponse({
        ok: true,
        data: await loadVoidHistory(body.from, body.to, body.page)
      });
    }
    if (action === 'modifier_analysis') {
      return jsonResponse({
        ok: true,
        data: await loadModifierAnalysis(body.from, body.to)
      });
    }
    return jsonResponse({ ok: false, error: 'Acción no reconocida.' }, 400);
  } catch (error) {
    console.error('[esencia-panel-api] Error', error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'No se pudo cargar el panel.'
    }, 400);
  }
}

if (import.meta.main) Deno.serve(handlePanelRequest);
