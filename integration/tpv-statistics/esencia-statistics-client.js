const DEFAULT_STORAGE_KEY = 'esencia-tpv-statistics-session-v1';

export class EsenciaStatisticsClient {
  constructor({ apiUrl, supabaseUrl, publishableKey, storageKey = DEFAULT_STORAGE_KEY }) {
    this.apiUrl = apiUrl;
    this.supabaseUrl = supabaseUrl;
    this.publishableKey = publishableKey;
    this.storageKey = storageKey;
    this.session = this.readSession();
    this.refreshPromise = null;
  }

  readSession() {
    try {
      const value = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
      return value?.access_token && value?.refresh_token ? value : null;
    } catch (_) {
      return null;
    }
  }

  saveSession(session) {
    this.session = {
      ...session,
      expires_at: Number(
        session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600)
      )
    };
    localStorage.setItem(this.storageKey, JSON.stringify(this.session));
  }

  clearSession() {
    this.session = null;
    localStorage.removeItem(this.storageKey);
  }

  async authRequest(path, payload, accessToken = '') {
    const response = await fetch(`${this.supabaseUrl}/auth/v1/${path}`, {
      method: 'POST',
      headers: {
        apikey: this.publishableKey,
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify(payload || {})
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error_description || body.msg || body.message || 'Error de autenticación.');
    }
    return body;
  }

  async signIn(email, password) {
    const session = await this.authRequest('token?grant_type=password', { email, password });
    this.saveSession(session);
    return session.user;
  }

  async signOut() {
    const token = this.session?.access_token || '';
    try {
      if (token) await this.authRequest('logout', {}, token);
    } finally {
      this.clearSession();
    }
  }

  async accessToken() {
    this.session = this.session || this.readSession();
    if (!this.session) throw new Error('Debes iniciar sesión.');
    if (Number(this.session.expires_at || 0) > Math.floor(Date.now() / 1000) + 60) {
      return this.session.access_token;
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.authRequest('token?grant_type=refresh_token', {
        refresh_token: this.session.refresh_token
      }).then(session => {
        this.saveSession(session);
        return this.session.access_token;
      }).catch(error => {
        this.clearSession();
        throw error;
      }).finally(() => {
        this.refreshPromise = null;
      });
    }
    return await this.refreshPromise;
  }

  async request(action, payload = {}) {
    const token = await this.accessToken();
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ type: 'web_app', action, ...payload })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true) {
      if (response.status === 401) this.clearSession();
      throw new Error(body.error || 'No se pudieron cargar las estadísticas.');
    }
    return body.data;
  }

  overview({ period = 'today', from, to } = {}) {
    return this.request('overview', { period, from, to });
  }

  voidHistory({ from, to, page = 0 }) {
    return this.request('void_history', { from, to, page });
  }

  modifierAnalysis({ from, to }) {
    return this.request('modifier_analysis', { from, to });
  }
}

export const ESENCIA_STATISTICS_CONFIG = Object.freeze({
  apiUrl: 'https://tbqvypdxcgeofsmiqmuo.supabase.co/functions/v1/esencia-panel-api',
  supabaseUrl: 'https://tbqvypdxcgeofsmiqmuo.supabase.co',
  publishableKey: 'sb_publishable_WmnIGzfpX1ofhnGWNDkwJA_eIimJy7X'
});
