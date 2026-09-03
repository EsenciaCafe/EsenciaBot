(function () {
  'use strict';

  const config = window.ESENCIA_CONFIG || {};
  const telegram = window.Telegram && window.Telegram.WebApp;
  const initData = telegram ? telegram.initData : '';
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

  const state = {
    summaryPeriod: 'today',
    summaryFrom: '',
    summaryTo: '',
    historyPage: 0,
    historyHasMore: false,
    historyFrom: '',
    historyTo: '',
    activeView: 'history-view',
    summaryLoading: false,
    historyLoading: false
  };

  const elements = {
    access: document.getElementById('access-state'),
    accessMessage: document.getElementById('access-message'),
    retry: document.getElementById('retry-button'),
    app: document.getElementById('app'),
    summaryView: document.getElementById('summary-view'),
    historyView: document.getElementById('history-view'),
    summaryError: document.getElementById('summary-error'),
    historyError: document.getElementById('history-error'),
    historyList: document.getElementById('history-list'),
    historyLoading: document.getElementById('history-loading'),
    historyEmpty: document.getElementById('history-empty'),
    loadMore: document.getElementById('load-more'),
    summaryDateFrom: document.getElementById('summary-date-from'),
    summaryDateTo: document.getElementById('summary-date-to'),
    dateFrom: document.getElementById('date-from'),
    dateTo: document.getElementById('date-to'),
    detail: document.getElementById('void-detail')
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

  async function api(action, payload) {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      throw new Error(body.error || 'No se pudo cargar la información.');
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

  function switchView(viewId) {
    state.activeView = viewId;
    elements.summaryView.hidden = viewId !== 'summary-view';
    elements.historyView.hidden = viewId !== 'history-view';
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.view === viewId);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    vibrate('light');
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
    document.getElementById('refresh-summary').addEventListener('click', () => loadSummary());
    document.getElementById('refresh-history').addEventListener('click', () => loadHistory());
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
    if (telegram && telegram.BackButton) telegram.BackButton.onClick(closeDetail);
  }

  async function start() {
    bindEvents();
    setSummaryPreset('today');
    setHistoryRange('month');

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
    if (!initData) {
      elements.access.querySelector('h1').textContent = 'Abre el panel desde Telegram';
      elements.accessMessage.textContent = 'Por seguridad, esta información solo se muestra al entrar desde el botón del bot de Esencia.';
      elements.access.querySelector('.loader').hidden = true;
      return;
    }

    try {
      await Promise.all([
        loadSummary(true),
        loadHistory({ throwOnError: true })
      ]);
      elements.access.hidden = true;
      elements.app.hidden = false;
      switchView('history-view');
    } catch (error) {
      elements.access.querySelector('h1').textContent = 'No se pudo abrir el panel';
      elements.accessMessage.textContent = error.message || 'Vuelve a intentarlo desde el bot.';
      elements.access.querySelector('.loader').hidden = true;
      elements.retry.hidden = false;
    }
  }

  start();
})();
