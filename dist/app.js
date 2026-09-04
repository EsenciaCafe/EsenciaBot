(function () {
  'use strict';

  const config = window.ESENCIA_CONFIG || {};
  const telegram = window.Telegram && window.Telegram.WebApp;
  const initData = telegram ? telegram.initData : '';
  const authStorageKey = 'esencia-panel-session-v1';
  let authSession = null;
  let refreshPromise = null;
  const money = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  });
  const quantities = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 });
  const dayLabel = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Atlantic/Canary'
  });
  const dateTime = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Atlantic/Canary'
  });
  const timeOnly = new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Atlantic/Canary'
  });
  const calendarDate = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });

  const state = {
    summaryPeriod: 'today',
    summaryFrom: '',
    summaryTo: '',
    historyPage: 0,
    historyHasMore: false,
    historyFrom: '',
    historyTo: '',
    activeView: 'summary-view',
    summaryLoading: false,
    historyLoading: false,
    toppingsExpanded: false,
    toppingsData: null,
    modifiersFrom: '',
    modifiersTo: '',
    modifiersLoading: false,
    modifiersLoaded: false,
    modifiersData: null,
    selectedModifierProduct: ''
  };

  const elements = {
    access: document.getElementById('access-state'),
    accessMessage: document.getElementById('access-message'),
    retry: document.getElementById('retry-button'),
    loginForm: document.getElementById('login-form'),
    loginEmail: document.getElementById('login-email'),
    loginPassword: document.getElementById('login-password'),
    loginError: document.getElementById('login-error'),
    app: document.getElementById('app'),
    summaryView: document.getElementById('summary-view'),
    historyView: document.getElementById('history-view'),
    modifiersView: document.getElementById('modifiers-view'),
    summaryError: document.getElementById('summary-error'),
    historyError: document.getElementById('history-error'),
    historyList: document.getElementById('history-list'),
    historyLoading: document.getElementById('history-loading'),
    historyEmpty: document.getElementById('history-empty'),
    modifiersError: document.getElementById('modifiers-error'),
    modifiersLoading: document.getElementById('modifiers-loading'),
    modifiersContent: document.getElementById('modifiers-content'),
    modifiersEmpty: document.getElementById('modifiers-empty'),
    modifierProduct: document.getElementById('modifier-product'),
    modifierDateFrom: document.getElementById('modifier-date-from'),
    modifierDateTo: document.getElementById('modifier-date-to'),
    loadMore: document.getElementById('load-more'),
    summaryDateFrom: document.getElementById('summary-date-from'),
    summaryDateTo: document.getElementById('summary-date-to'),
    dateFrom: document.getElementById('date-from'),
    dateTo: document.getElementById('date-to'),
    detail: document.getElementById('void-detail'),
    accountDialog: document.getElementById('account-dialog'),
    accountForm: document.getElementById('account-form'),
    accountEmail: document.getElementById('account-email'),
    accountPassword: document.getElementById('account-password'),
    accountPasswordConfirm: document.getElementById('account-password-confirm'),
    accountError: document.getElementById('account-error'),
    accountSuccess: document.getElementById('account-success'),
    setupWebAccess: document.getElementById('setup-web-access'),
    logout: document.getElementById('logout-button')
  };

  function localDateKey(date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Atlantic/Canary'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function shiftDateKey(key, days) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function formatMoney(value) {
    return money.format(Number(value || 0));
  }

  function formatQuantity(value) {
    return quantities.format(Number(value || 0));
  }

  function formatDate(value) {
    return calendarDate.format(new Date(`${value}T12:00:00Z`));
  }

  function trendPresentation(current, previous, percentage) {
    if (Number(previous || 0) === 0 && Number(current || 0) > 0) {
      return { text: 'Nuevo', className: 'is-up' };
    }
    const value = Number(percentage || 0);
    if (value > 0) return { text: `↑ ${formatQuantity(value)} %`, className: 'is-up' };
    if (value < 0) return { text: `↓ ${formatQuantity(Math.abs(value))} %`, className: 'is-down' };
    return { text: 'Sin cambio', className: 'is-flat' };
  }

  function vibrate(style) {
    try {
      telegram && telegram.HapticFeedback && telegram.HapticFeedback.impactOccurred(style || 'light');
    } catch (_) {
      // La vibración es un detalle opcional de Telegram.
    }
  }

  function showError(element, message) {
    element.textContent = message;
    element.hidden = false;
  }

  function clearError(element) {
    element.textContent = '';
    element.hidden = true;
  }

  function readAuthSession() {
    try {
      const value = JSON.parse(localStorage.getItem(authStorageKey) || 'null');
      if (!value || !value.access_token || !value.refresh_token) return null;
      return value;
    } catch (_) {
      return null;
    }
  }

  function saveAuthSession(session) {
    authSession = {
      ...session,
      expires_at: Number(session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600))
    };
    localStorage.setItem(authStorageKey, JSON.stringify(authSession));
  }

  function clearAuthSession() {
    authSession = null;
    localStorage.removeItem(authStorageKey);
  }

  async function authRequest(path, payload, token) {
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      throw new Error('El acceso web todavía no está configurado.');
    }
    const response = await fetch(`${config.supabaseUrl}/auth/v1/${path}`, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload || {})
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error_description || body.msg || body.message || 'No se pudo iniciar sesión.');
    }
    return body;
  }

  async function signInWithPassword(email, password) {
    const session = await authRequest('token?grant_type=password', { email, password });
    saveAuthSession(session);
    return session;
  }

  async function refreshAuthSession() {
    if (!authSession?.refresh_token) throw new Error('Inicia sesión para consultar el panel.');
    if (!refreshPromise) {
      refreshPromise = authRequest('token?grant_type=refresh_token', {
        refresh_token: authSession.refresh_token
      }).then(session => {
        saveAuthSession(session);
        return authSession.access_token;
      }).catch(error => {
        clearAuthSession();
        throw error;
      }).finally(() => {
        refreshPromise = null;
      });
    }
    return await refreshPromise;
  }

  async function validAccessToken() {
    if (initData) return '';
    authSession = authSession || readAuthSession();
    if (!authSession) throw new Error('Inicia sesión para consultar el panel.');
    if (Number(authSession.expires_at || 0) > Math.floor(Date.now() / 1000) + 60) {
      return authSession.access_token;
    }
    return await refreshAuthSession();
  }

  async function api(action, payload) {
    const accessToken = await validAccessToken();
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      },
      body: JSON.stringify({
        type: 'web_app',
        action,
        initData,
        ...(payload || {})
      })
    });
    let body;
    try {
      body = await response.json();
    } catch (_) {
      throw new Error('El servidor no devolvió una respuesta válida.');
    }
    if (!response.ok || body.ok !== true) {
      const error = new Error(body.error || 'No se pudo cargar la información.');
      error.status = response.status;
      throw error;
    }
    return body.data;
  }

  function renderOverview(data) {
    const summary = data.sales || {};
    const payments = summary.payments || {};
    const voids = data.voids || {};
    setText('metric-net', formatMoney(summary.net));
    setText('metric-tickets', String(summary.tickets || 0));
    setText('metric-average', `Ticket medio ${formatMoney(summary.average)}`);
    setText('metric-period', data.label ? data.label[0].toUpperCase() + data.label.slice(1) : 'Periodo');
    setText('metric-voids', String(voids.counted || 0));
    setText('metric-void-units', `${formatQuantity(voids.units)} artículos`);
    setText('metric-void-amount', formatMoney(voids.amount));
    setText('metric-excluded', voids.excluded ? `${voids.excluded} no contabilizados` : 'Sin exclusiones');
    setText('payment-cash', formatMoney(payments.cash));
    setText('payment-card', formatMoney(payments.card));
    setText('payment-gift', formatMoney(payments.gift));
    setText('payment-total', formatMoney(
      Number(payments.cash || 0) + Number(payments.card || 0) + Number(payments.gift || 0)
    ));

    const list = document.getElementById('top-products');
    const empty = document.getElementById('top-empty');
    list.replaceChildren();
    const top = Array.isArray(data.top) ? data.top : [];
    empty.hidden = top.length > 0;
    top.forEach((item) => {
      const row = document.createElement('li');
      const name = document.createElement('div');
      name.className = 'rank-name';
      const nameInner = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = item.name || 'Artículo';
      const split = document.createElement('small');
      split.textContent = `${formatQuantity(item.soldQuantity)} vendidas · ${formatQuantity(item.voidQuantity)} vaciadas`;
      nameInner.append(title, split);
      name.append(nameInner);

      const total = document.createElement('div');
      total.className = 'rank-total';
      const quantity = document.createElement('strong');
      quantity.textContent = `${formatQuantity(item.quantity)} uds.`;
      const amount = document.createElement('small');
      amount.textContent = formatMoney(item.total);
      total.append(quantity, amount);
      row.append(name, total);
      list.append(row);
    });

    state.toppingsData = data.toppings || { pancakeServings: 0, items: [] };
    renderToppings();
  }

  function renderToppings() {
    const data = state.toppingsData || { pancakeServings: 0, items: [] };
    const servings = Number(data.pancakeServings || 0);
    const items = Array.isArray(data.items) ? data.items : [];
    const list = document.getElementById('top-toppings');
    const empty = document.getElementById('toppings-empty');
    const toggle = document.getElementById('toggle-toppings');
    const visible = state.toppingsExpanded ? items : items.slice(0, 8);
    setText(
      'topping-servings',
      `${formatQuantity(servings)} raciones · ${formatQuantity(data.soldPancakeServings)} vendidas · ${formatQuantity(data.voidPancakeServings)} vaciadas`
    );
    list.replaceChildren();
    empty.hidden = items.length > 0;
    visible.forEach((item) => {
      const row = document.createElement('li');
      const name = document.createElement('div');
      name.className = 'rank-name';
      const nameInner = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = item.name || 'Topping';
      const share = document.createElement('small');
      share.textContent = `${formatQuantity(item.percentage)} % de las raciones`;
      const split = document.createElement('small');
      split.textContent = `${formatQuantity(item.soldUnits)} vendidos · ${formatQuantity(item.voidUnits)} vaciados`;
      nameInner.append(title, share, split);
      name.append(nameInner);

      const total = document.createElement('div');
      total.className = 'rank-total';
      const quantity = document.createElement('strong');
      quantity.textContent = `${formatQuantity(item.units)} uds.`;
      const amount = document.createElement('small');
      amount.textContent = formatMoney(item.amount);
      total.append(quantity, amount);
      row.append(name, total);
      list.append(row);
    });
    toggle.hidden = items.length <= 8;
    toggle.textContent = state.toppingsExpanded ? 'Ver menos' : `Ver todos (${items.length})`;
  }

  async function loadSummary(throwOnError) {
    if (state.summaryLoading) return;
    state.summaryLoading = true;
    clearError(elements.summaryError);
    document.getElementById('refresh-summary').disabled = true;
    try {
      renderOverview(await api('overview', {
        period: state.summaryPeriod,
        from: state.summaryFrom,
        to: state.summaryTo
      }));
    } catch (error) {
      showError(elements.summaryError, error.message);
      if (throwOnError) throw error;
    } finally {
      state.summaryLoading = false;
      document.getElementById('refresh-summary').disabled = false;
    }
  }

  function renderSelectedModifierProduct() {
    const data = state.modifiersData || { products: [] };
    const products = Array.isArray(data.products) ? data.products : [];
    const product = products.find((item) => item.key === state.selectedModifierProduct) || products[0];
    if (!product) return;
    state.selectedModifierProduct = product.key;
    elements.modifierProduct.value = product.key;
    setText('modifier-product-name', product.name || 'Producto');
    setText(
      'modifier-product-units',
      `${formatQuantity(product.units)} uds. · ${formatQuantity(product.soldUnits)} vendidas · ${formatQuantity(product.voidUnits)} vaciadas`
    );
    setText('modifier-previous-units', formatQuantity(product.previousUnits));
    setText('modifier-count', String(Array.isArray(product.modifiers) ? product.modifiers.length : 0));
    setText(
      'modifier-comparison-label',
      `Comparado con ${formatDate(data.previousFrom)} – ${formatDate(data.previousTo)}`
    );
    const productTrend = trendPresentation(product.units, product.previousUnits, product.trendPercentage);
    const trendElement = document.getElementById('modifier-product-trend');
    trendElement.textContent = productTrend.text;
    trendElement.className = `trend-value ${productTrend.className}`;

    const list = document.getElementById('modifier-list');
    list.replaceChildren();
    const modifiers = Array.isArray(product.modifiers) ? product.modifiers : [];
    modifiers.forEach((modifier) => {
      const row = document.createElement('li');
      const name = document.createElement('div');
      name.className = 'rank-name';
      const nameInner = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = modifier.name || 'Modificador';
      const share = document.createElement('small');
      share.textContent = `${formatQuantity(modifier.percentage)} % de las unidades`;
      const split = document.createElement('small');
      split.textContent = `${formatQuantity(modifier.soldUnits)} vendidos · ${formatQuantity(modifier.voidUnits)} vaciados`;
      const trend = trendPresentation(modifier.units, modifier.previousUnits, modifier.trendPercentage);
      const trendLine = document.createElement('small');
      trendLine.className = `modifier-trend ${trend.className}`;
      trendLine.textContent = `${trend.text} · antes ${formatQuantity(modifier.previousUnits)}`;
      nameInner.append(title, share, split, trendLine);
      name.append(nameInner);

      const total = document.createElement('div');
      total.className = 'rank-total';
      const quantity = document.createElement('strong');
      quantity.textContent = `${formatQuantity(modifier.units)} uds.`;
      const amount = document.createElement('small');
      amount.textContent = formatMoney(modifier.amount);
      total.append(quantity, amount);
      row.append(name, total);
      list.append(row);
    });
  }

  function renderModifierAnalysis(data) {
    const products = Array.isArray(data.products) ? data.products : [];
    state.modifiersData = data;
    elements.modifierProduct.replaceChildren();
    products.forEach((product) => {
      const option = document.createElement('option');
      option.value = product.key;
      option.textContent = `${product.name} · ${formatQuantity(product.units)} uds.`;
      elements.modifierProduct.append(option);
    });
    if (!products.some((product) => product.key === state.selectedModifierProduct)) {
      state.selectedModifierProduct = products[0]?.key || '';
    }
    elements.modifiersContent.hidden = products.length === 0;
    elements.modifiersEmpty.hidden = products.length > 0;
    if (products.length > 0) renderSelectedModifierProduct();
  }

  async function loadModifiers() {
    if (state.modifiersLoading) return;
    state.modifiersLoading = true;
    clearError(elements.modifiersError);
    elements.modifiersLoading.hidden = false;
    document.getElementById('refresh-modifiers').disabled = true;
    try {
      const data = await api('modifier_analysis', {
        from: state.modifiersFrom,
        to: state.modifiersTo
      });
      state.modifiersLoaded = true;
      renderModifierAnalysis(data);
    } catch (error) {
      showError(elements.modifiersError, error.message);
    } finally {
      state.modifiersLoading = false;
      elements.modifiersLoading.hidden = true;
      document.getElementById('refresh-modifiers').disabled = false;
    }
  }

  function optionsText(options) {
    if (!Array.isArray(options) || options.length === 0) return '';
    return options
      .map((option) => {
        const name = String(option && option.name || '').trim();
        const quantity = Number(option && option.quantity || 0);
        return name ? `${quantity > 1 ? `${formatQuantity(quantity)} × ` : ''}${name}` : '';
      })
      .filter(Boolean)
      .join(' · ');
  }

  function openDetail(order) {
    setText('detail-date', dateTime.format(new Date(order.occurred_at)));
    setText('detail-order', order.order_name || 'Pedido');
    setText('detail-staff', order.staff_name ? `Empleado: ${order.staff_name}` : 'Empleado no indicado');
    setText('detail-total', formatMoney(order.total_amount));
    setText('detail-units', `${formatQuantity(order.item_units)} uds.`);
    setText('detail-id', `Registro ${order.event_id}`);

    const status = document.getElementById('detail-status');
    const counted = order.counts_in_statistics !== false;
    status.className = `status-badge ${counted ? 'is-counted' : 'is-excluded'}`;
    status.textContent = counted ? 'Contabilizado en estadísticas' : 'Excluido de estadísticas';

    const linesContainer = document.getElementById('detail-lines');
    linesContainer.replaceChildren();
    const lines = Array.isArray(order.lines) ? order.lines : [];
    lines.forEach((line) => {
      const row = document.createElement('div');
      row.className = 'detail-line';
      const main = document.createElement('div');
      main.className = 'detail-line-main';
      const title = document.createElement('strong');
      title.textContent = line.name || 'Artículo';
      main.append(title);
      const options = optionsText(line.selected_options);
      if (options) {
        const meta = document.createElement('small');
        meta.textContent = options;
        main.append(meta);
      }
      const price = document.createElement('div');
      price.className = 'detail-line-price';
      const amount = document.createElement('strong');
      amount.textContent = formatMoney(line.total_amount);
      const quantity = document.createElement('small');
      quantity.textContent = `× ${formatQuantity(line.quantity)}`;
      price.append(amount, quantity);
      row.append(main, price);
      linesContainer.append(row);
    });
    if (lines.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-copy';
      empty.textContent = 'No hay líneas guardadas para este vaciado.';
      linesContainer.append(empty);
    }

    elements.detail.showModal();
    if (telegram && telegram.BackButton) telegram.BackButton.show();
    vibrate('light');
  }

  function closeDetail() {
    if (elements.detail.open) elements.detail.close();
    if (telegram && telegram.BackButton) telegram.BackButton.hide();
  }

  function createVoidCard(order) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'void-card';
    button.addEventListener('click', () => openDetail(order));

    const top = document.createElement('div');
    top.className = 'void-card-top';
    const name = document.createElement('strong');
    name.textContent = order.order_name || 'Pedido';
    const time = document.createElement('time');
    time.dateTime = order.occurred_at || '';
    time.textContent = timeOnly.format(new Date(order.occurred_at));
    top.append(name, time);

    const total = document.createElement('div');
    total.className = 'void-card-total';
    total.textContent = formatMoney(order.total_amount);

    const bottom = document.createElement('div');
    bottom.className = 'void-card-bottom';
    const products = document.createElement('span');
    const lines = Array.isArray(order.lines) ? order.lines : [];
    products.textContent = lines.length
      ? lines.slice(0, 3).map((line) => `${formatQuantity(line.quantity)}× ${line.name}`).join(' · ')
      : `${formatQuantity(order.item_units)} artículos`;
    const stateWrap = document.createElement('span');
    stateWrap.style.display = 'inline-flex';
    stateWrap.style.alignItems = 'center';
    stateWrap.style.gap = '0.35rem';
    const dot = document.createElement('i');
    dot.className = `counting-dot ${order.counts_in_statistics === false ? 'is-excluded' : ''}`;
    stateWrap.append(dot, document.createTextNode(order.counts_in_statistics === false ? 'Excluido' : 'Cuenta'));
    bottom.append(products, stateWrap);
    button.append(top, total, bottom);
    return button;
  }

  function renderHistory(data, append) {
    const summary = data.summary || {};
    setText('history-counted', String(summary.counted || 0));
    setText('history-amount', formatMoney(summary.amount));
    setText('history-excluded', String(summary.excluded || 0));
    if (summary.truncated) {
      showError(elements.historyError, 'El intervalo contiene más de 10.000 vaciados. Acota las fechas para obtener totales exactos.');
    }

    if (!append) elements.historyList.replaceChildren();
    const orders = Array.isArray(data.orders) ? data.orders : [];
    let previousDate = append && elements.historyList.lastElementChild
      ? elements.historyList.lastElementChild.dataset.businessDate || ''
      : '';
    orders.forEach((order) => {
      if (order.business_date !== previousDate) {
        const separator = document.createElement('div');
        separator.className = 'date-separator';
        separator.dataset.businessDate = order.business_date || '';
        separator.textContent = dayLabel.format(new Date(`${order.business_date}T12:00:00Z`));
        elements.historyList.append(separator);
        previousDate = order.business_date;
      }
      const card = createVoidCard(order);
      card.dataset.businessDate = order.business_date || '';
      elements.historyList.append(card);
    });

    const hasAny = elements.historyList.querySelector('.void-card') !== null;
    elements.historyEmpty.hidden = hasAny;
    state.historyHasMore = Boolean(data.hasMore);
    elements.loadMore.hidden = !state.historyHasMore;
  }

  async function loadHistory(options) {
    const settings = options || {};
    if (state.historyLoading) return;
    state.historyLoading = true;
    if (!settings.append) {
      state.historyPage = 0;
      clearError(elements.historyError);
      elements.historyList.replaceChildren();
    }
    elements.historyLoading.hidden = false;
    elements.historyEmpty.hidden = true;
    elements.loadMore.hidden = true;
    try {
      const data = await api('void_history', {
        from: state.historyFrom,
        to: state.historyTo,
        page: state.historyPage
      });
      renderHistory(data, Boolean(settings.append));
    } catch (error) {
      showError(elements.historyError, error.message);
      elements.historyEmpty.hidden = elements.historyList.querySelector('.void-card') !== null;
      if (settings.throwOnError) throw error;
    } finally {
      state.historyLoading = false;
      elements.historyLoading.hidden = true;
    }
  }

  function setHistoryRange(range) {
    const today = localDateKey(new Date());
    let from = `${today.slice(0, 7)}-01`;
    if (range === 'today') from = today;
    if (range === 'week') from = shiftDateKey(today, -6);
    if (range === 'year') from = shiftDateKey(today, -364);
    state.historyFrom = from;
    state.historyTo = today;
    elements.dateFrom.value = from;
    elements.dateTo.value = today;
  }

  function setSummaryPreset(preset) {
    const today = localDateKey(new Date());
    let from = today;
    let to = today;
    let period = preset;
    if (preset === 'yesterday') {
      from = shiftDateKey(today, -1);
      to = from;
    }
    if (preset === 'week') {
      from = shiftDateKey(today, -6);
      period = 'range';
    }
    if (preset === 'month') from = `${today.slice(0, 7)}-01`;
    state.summaryPeriod = period;
    state.summaryFrom = from;
    state.summaryTo = to;
    elements.summaryDateFrom.value = from;
    elements.summaryDateTo.value = to;
  }

  function setModifierRange(range) {
    const today = localDateKey(new Date());
    let from = `${today.slice(0, 7)}-01`;
    if (range === 'today') from = today;
    if (range === 'week') from = shiftDateKey(today, -6);
    if (range === 'year') from = shiftDateKey(today, -364);
    state.modifiersFrom = from;
    state.modifiersTo = today;
    elements.modifierDateFrom.value = from;
    elements.modifierDateTo.value = today;
  }

  function switchView(viewId) {
    state.activeView = viewId;
    elements.summaryView.hidden = viewId !== 'summary-view';
    elements.historyView.hidden = viewId !== 'history-view';
    elements.modifiersView.hidden = viewId !== 'modifiers-view';
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.view === viewId);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    vibrate('light');
    if (viewId === 'modifiers-view' && !state.modifiersLoaded) loadModifiers();
  }

  function bindEvents() {
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => switchView(button.dataset.view));
    });
    document.querySelectorAll('[data-summary-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-summary-preset]').forEach((item) => item.classList.remove('is-active'));
        button.classList.add('is-active');
        setSummaryPreset(button.dataset.summaryPreset);
        vibrate('light');
        loadSummary();
      });
    });
    document.getElementById('summary-date-filter').addEventListener('submit', (event) => {
      event.preventDefault();
      state.summaryPeriod = 'range';
      state.summaryFrom = elements.summaryDateFrom.value;
      state.summaryTo = elements.summaryDateTo.value;
      document.querySelectorAll('[data-summary-preset]').forEach((item) => item.classList.remove('is-active'));
      loadSummary();
    });
    document.querySelectorAll('[data-range]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-range]').forEach((item) => item.classList.remove('is-active'));
        button.classList.add('is-active');
        setHistoryRange(button.dataset.range);
        vibrate('light');
        loadHistory();
      });
    });
    document.getElementById('date-filter').addEventListener('submit', (event) => {
      event.preventDefault();
      state.historyFrom = elements.dateFrom.value;
      state.historyTo = elements.dateTo.value;
      document.querySelectorAll('[data-range]').forEach((item) => item.classList.remove('is-active'));
      loadHistory();
    });
    document.querySelectorAll('[data-modifier-range]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-modifier-range]').forEach((item) => item.classList.remove('is-active'));
        button.classList.add('is-active');
        setModifierRange(button.dataset.modifierRange);
        vibrate('light');
        loadModifiers();
      });
    });
    document.getElementById('modifier-date-filter').addEventListener('submit', (event) => {
      event.preventDefault();
      state.modifiersFrom = elements.modifierDateFrom.value;
      state.modifiersTo = elements.modifierDateTo.value;
      document.querySelectorAll('[data-modifier-range]').forEach((item) => item.classList.remove('is-active'));
      loadModifiers();
    });
    elements.modifierProduct.addEventListener('change', () => {
      state.selectedModifierProduct = elements.modifierProduct.value;
      renderSelectedModifierProduct();
      vibrate('light');
    });
    document.getElementById('refresh-summary').addEventListener('click', () => loadSummary());
    document.getElementById('toggle-toppings').addEventListener('click', () => {
      state.toppingsExpanded = !state.toppingsExpanded;
      renderToppings();
      vibrate('light');
    });
    document.getElementById('refresh-history').addEventListener('click', () => loadHistory());
    document.getElementById('refresh-modifiers').addEventListener('click', () => loadModifiers());
    elements.loadMore.addEventListener('click', () => {
      if (!state.historyHasMore) return;
      state.historyPage += 1;
      loadHistory({ append: true });
    });
    document.getElementById('close-detail').addEventListener('click', closeDetail);
    elements.detail.addEventListener('click', (event) => {
      if (event.target === elements.detail) closeDetail();
    });
    elements.detail.addEventListener('close', () => {
      if (telegram && telegram.BackButton) telegram.BackButton.hide();
    });
    elements.retry.addEventListener('click', () => window.location.reload());
    elements.loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearError(elements.loginError);
      const button = elements.loginForm.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await signInWithPassword(elements.loginEmail.value.trim(), elements.loginPassword.value);
        elements.loginPassword.value = '';
        await openPanel('account');
      } catch (error) {
        showError(elements.loginError, error.message || 'No se pudo iniciar sesión.');
      } finally {
        button.disabled = false;
      }
    });
    elements.setupWebAccess.addEventListener('click', () => {
      clearError(elements.accountError);
      elements.accountSuccess.hidden = true;
      elements.accountDialog.showModal();
    });
    document.getElementById('close-account').addEventListener('click', () => elements.accountDialog.close());
    elements.accountForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearError(elements.accountError);
      elements.accountSuccess.hidden = true;
      if (elements.accountPassword.value !== elements.accountPasswordConfirm.value) {
        showError(elements.accountError, 'Las contraseñas no coinciden.');
        return;
      }
      const button = document.getElementById('create-account-button');
      button.disabled = true;
      try {
        const email = elements.accountEmail.value.trim();
        const password = elements.accountPassword.value;
        await api('configure_web_account', { email, password });
        await signInWithPassword(email, password);
        elements.accountPassword.value = '';
        elements.accountPasswordConfirm.value = '';
        elements.accountSuccess.textContent = 'Cuenta creada. Ya puedes abrir esta dirección desde cualquier navegador.';
        elements.accountSuccess.hidden = false;
      } catch (error) {
        showError(elements.accountError, error.message || 'No se pudo crear la cuenta.');
      } finally {
        button.disabled = false;
      }
    });
    elements.logout.addEventListener('click', async () => {
      const token = authSession?.access_token || '';
      try {
        if (token) await authRequest('logout', {}, token);
      } catch (_) {
        // La sesión local se elimina aunque el servidor ya la haya invalidado.
      }
      clearAuthSession();
      elements.app.hidden = true;
      showLogin();
    });
    if (telegram && telegram.BackButton) telegram.BackButton.onClick(closeDetail);
  }

  function showLogin(message) {
    elements.access.hidden = false;
    elements.access.querySelector('h1').textContent = 'Entrar al panel';
    elements.accessMessage.textContent = message || 'Consulta las ventas y los vaciados de Esencia desde cualquier dispositivo.';
    elements.access.querySelector('.loader').hidden = true;
    elements.retry.hidden = true;
    elements.loginForm.hidden = false;
    elements.loginEmail.focus();
  }

  async function openPanel(accessMode) {
    await Promise.all([
      loadSummary(true),
      loadHistory({ throwOnError: true })
    ]);
    elements.access.hidden = true;
    elements.loginForm.hidden = true;
    elements.app.hidden = false;
    const isTelegram = accessMode === 'telegram';
    setText('access-mode-label', isTelegram ? 'Telegram' : 'Cuenta');
    elements.setupWebAccess.hidden = !isTelegram;
    elements.logout.hidden = isTelegram;
    switchView('summary-view');
  }

  async function start() {
    bindEvents();
    setSummaryPreset('today');
    setHistoryRange('month');
    setModifierRange('month');

    if (telegram) {
      telegram.ready();
      telegram.expand();
      try {
        telegram.setHeaderColor('secondary_bg_color');
        telegram.setBackgroundColor('bg_color');
      } catch (_) {
        // Clientes antiguos pueden no admitir estos valores de tema.
      }
    }

    if (!config.apiUrl) {
      elements.accessMessage.textContent = 'Falta configurar la dirección del servicio.';
      elements.retry.hidden = false;
      return;
    }
    try {
      if (!initData) {
        authSession = readAuthSession();
        if (!authSession) {
          showLogin();
          return;
        }
      }
      await openPanel(initData ? 'telegram' : 'account');
    } catch (error) {
      if (!initData && (error.status === 401 || !authSession)) {
        clearAuthSession();
        showLogin(error.message);
        return;
      }
      elements.access.querySelector('h1').textContent = 'No se pudo abrir el panel';
      elements.accessMessage.textContent = error.message || 'Vuelve a intentarlo desde el bot.';
      elements.access.querySelector('.loader').hidden = true;
      elements.retry.hidden = false;
    }
  }

  start();
})();
