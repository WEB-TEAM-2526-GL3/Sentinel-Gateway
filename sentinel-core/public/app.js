const app = document.getElementById('app');

const TOKEN_KEY = 'sentinel_token';
const state = {
  currentView: 'overview',
  me: null,
  data: {
    admins: [],
    incidents: [],
    gatewayServices: [],
    gatewayRoutes: [],
    gatewayConsumers: [],
    monitoringRules: [],
    monitoringStatus: null,
    latestMetrics: null,
    webhooks: [],
    webhookDeliveries: [],
    messengerEvents: [],
    messengerRecipients: [],
  },
  errors: {},
  sse: {
    connected: false,
    events: [],
    samples: [],
  },
  eventSource: null,
};

const queries = {
  me: `
    query Me {
      me { id email fullName role status createdAt }
    }
  `,
  overview: `
    query Overview {
      incidents { id reason status severity createdAt serviceId providerId }
      monitoringStatus { checkedAt totalRules activeRules triggeredRules }
      gatewayServices { id name url host path protocol }
    }
  `,
  admins: `
    query Admins {
      admins { id email fullName role status createdAt updatedAt }
    }
  `,
  gateway: `
    query Gateway {
      gatewayServices { id name url host path protocol port }
      gatewayRoutes { id name paths hosts methods stripPath }
      gatewayConsumers { id username customId apiKey tags }
    }
  `,
  incidents: `
    query Incidents($status: IncidentStatus) {
      incidents(status: $status) {
        id reason status severity serviceId providerId createdAt updatedAt resolvedAt
      }
    }
  `,
  incident: `
    query Incident($id: ID!) {
      incident(id: $id) {
        incident { id reason status severity serviceId providerId createdAt updatedAt resolvedAt }
        logs { id action adminName detailsJson createdAt }
      }
    }
  `,
  monitoring: `
    query Monitoring {
      monitoringRules {
        id name serviceName providerId type errorRateThreshold latencyThresholdMs
        metricWindow cooldownMinutes isActive severity lastTriggeredAt createdAt
      }
      monitoringStatus {
        checkedAt totalRules activeRules triggeredRules
        results { ruleId ruleName serviceName type triggered currentValue threshold reason checkedAt }
      }
    }
  `,
  metrics: `
    query Metrics {
      latestGatewayMetrics {
        totalRequests requestsPerSecond
        statusCodes { code count }
        latency { p50 p95 p99 }
      }
    }
  `,
  webhooks: `
    query Webhooks {
      webhooks { id name provider url eventTypes isActive hasSecret maxRetries createdAt updatedAt }
      webhookDeliveries { id webhookId eventType source status attemptCount responseStatus error durationMs createdAt deliveredAt }
      webhookEventTypes
    }
  `,
  messenger: `
    query Messenger {
      messengerEvents(limit: 25) {
        id senderId recipientId messageText postbackPayload timestamp receivedAt
      }
      messengerRecipients {
        senderId lastMessageText lastSeenAt
      }
    }
  `,
};

const mutations = {
  login: `
    mutation Login($input: LoginInput!) {
      login(input: $input) {
        accessToken
        user { id email fullName role status }
      }
    }
  `,
  register: `
    mutation Register($input: RegisterInput!) {
      register(input: $input) {
        accessToken
        user { id email fullName role status }
      }
    }
  `,
  createGatewayService: `
    mutation CreateGatewayService($input: GatewayServiceInput!) {
      createGatewayService(input: $input) { id name url host path protocol }
    }
  `,
  createIncident: `
    mutation CreateIncident($input: CreateIncidentInput!) {
      createIncident(input: $input) {
        incident { id reason status severity createdAt }
      }
    }
  `,
  createMonitoringRule: `
    mutation CreateMonitoringRule($input: CreateMonitoringRuleInput!) {
      createMonitoringRule(input: $input) {
        id name serviceName type severity isActive
      }
    }
  `,
  runMonitoringCheck: `
    mutation RunMonitoringCheck {
      runMonitoringCheck {
        checkedAt totalRules activeRules triggeredRules
      }
    }
  `,
  createWebhook: `
    mutation CreateWebhook($input: CreateWebhookInput!) {
      createWebhook(input: $input) {
        id name provider url eventTypes isActive hasSecret maxRetries
      }
    }
  `,
};

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function navigate(path) {
  window.history.pushState({}, '', path);
  render();
}

async function gql(query, variables = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch('/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.json();
  if (body.errors?.length) {
    const message = body.errors.map((error) => error.message).join(', ');
    if (message.toLowerCase().includes('unauthorized')) {
      clearToken();
      stopMetricsSse();
    }
    throw new Error(message);
  }

  return body.data;
}

function renderLogin() {
  stopMetricsSse();
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card">
        <p class="eyebrow">Sentinel Gateway</p>
        <h1>Unified Control Plane</h1>
        <p class="subtitle">Sign in to manage gateway routes, incidents, monitoring, webhooks, and live metrics.</p>

        <form id="login-form">
          <label>Email<input id="email" type="email" placeholder="admin@sentinel.com" required /></label>
          <label>Password<input id="password" type="password" placeholder="Password" required /></label>
          <p id="error" class="error" hidden></p>
          <button type="submit">Login</button>
        </form>

        <button class="link-button" id="go-register" type="button">Create admin account</button>
      </section>
    </main>
  `;

  document.getElementById('go-register').addEventListener('click', () => navigate('/register'));
  document.getElementById('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    showInlineError('');
    try {
      const data = await gql(mutations.login, {
        input: {
          email: value('email'),
          password: value('password'),
        },
      });
      saveToken(data.login.accessToken);
      navigate('/dashboard');
    } catch (error) {
      showInlineError(readError(error));
    }
  });
}

function renderRegister() {
  stopMetricsSse();
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card">
        <p class="eyebrow">Sentinel Gateway</p>
        <h1>Create Admin</h1>
        <p class="subtitle">CEO secret is required for admin registration.</p>

        <form id="register-form">
          <label>Full name<input id="fullName" type="text" placeholder="Sentinel Admin" required /></label>
          <label>Email<input id="email" type="email" placeholder="admin@sentinel.com" required /></label>
          <label>Password<input id="password" type="password" placeholder="Minimum 6 characters" required minlength="6" /></label>
          <label>CEO secret<input id="ceoSecret" type="password" required /></label>
          <p id="error" class="error" hidden></p>
          <button type="submit">Register</button>
        </form>

        <button class="link-button" id="go-login" type="button">Back to login</button>
      </section>
    </main>
  `;

  document.getElementById('go-login').addEventListener('click', () => navigate('/login'));
  document.getElementById('register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    showInlineError('');
    try {
      const data = await gql(mutations.register, {
        input: {
          fullName: value('fullName'),
          email: value('email'),
          password: value('password'),
          ceoSecret: value('ceoSecret'),
        },
      });
      saveToken(data.register.accessToken);
      navigate('/dashboard');
    } catch (error) {
      showInlineError(readError(error));
    }
  });
}

async function renderDashboard() {
  if (!getToken()) {
    navigate('/login');
    return;
  }

  app.innerHTML = `
    <main class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark">S</span>
          <div>
            <strong>Sentinel</strong>
            <small>Gateway</small>
          </div>
        </div>
        <nav class="nav">
          ${navButton('overview', 'Overview')}
          ${navButton('gateway', 'Gateway')}
          ${navButton('incidents', 'Incidents')}
          ${navButton('monitoring', 'Monitoring')}
          ${navButton('metrics', 'Live Metrics')}
          ${navButton('webhooks', 'Webhooks')}
          ${navButton('messenger', 'Messenger')}
          ${navButton('admins', 'Admins')}
        </nav>
        <button class="incident-room-button" id="incident-room-button" type="button">Open Incident Room</button>
      </aside>

      <section class="main">
        <header class="topbar">
          <div>
            <p class="eyebrow">Unified frontend</p>
            <h1 id="view-title">Dashboard</h1>
          </div>
          <div class="top-actions">
            <span id="sse-status" class="status-dot">SSE idle</span>
            <span id="me-text" class="me-text">Loading user</span>
            <button class="secondary" id="refresh-button" type="button">Refresh</button>
            <button class="danger-light" id="logout-button" type="button">Logout</button>
          </div>
        </header>
        <p id="global-error" class="error" hidden></p>
        <div id="view"></div>
      </section>
    </main>
  `;

  bindDashboardEvents();
  startMetricsSse();
  await bootDashboard();
}

function navButton(view, label) {
  const active = state.currentView === view ? 'active' : '';
  return `<button class="nav-item ${active}" type="button" data-view="${view}">${label}</button>`;
}

function bindDashboardEvents() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', async () => {
      state.currentView = button.dataset.view;
      renderDashboardShellOnly();
      await loadViewData(state.currentView);
      renderCurrentView();
    });
  });

  document.getElementById('refresh-button').addEventListener('click', async () => {
    await loadViewData(state.currentView);
    renderCurrentView();
  });

  document.getElementById('logout-button').addEventListener('click', () => {
    clearToken();
    stopMetricsSse();
    navigate('/login');
  });

  document.getElementById('incident-room-button').addEventListener('click', () => {
    openIncidentRoom();
  });
}

async function bootDashboard() {
  try {
    const data = await gql(queries.me);
    state.me = data.me;
    document.getElementById('me-text').textContent = `${data.me.fullName} · ${data.me.email}`;
  } catch (error) {
    showGlobalError(readError(error));
    if (readError(error).toLowerCase().includes('unauthorized')) {
      navigate('/login');
      return;
    }
  }

  await loadViewData(state.currentView);
  renderCurrentView();
}

function renderDashboardShellOnly() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === state.currentView);
  });
}

async function loadViewData(view) {
  showGlobalError('');
  try {
    if (view === 'overview') {
      const data = await gql(queries.overview);
      state.data.incidents = data.incidents;
      state.data.monitoringStatus = data.monitoringStatus;
      state.data.gatewayServices = data.gatewayServices;
    }
    if (view === 'admins') {
      state.data.admins = (await gql(queries.admins)).admins;
    }
    if (view === 'gateway') {
      const data = await gql(queries.gateway);
      state.data.gatewayServices = data.gatewayServices;
      state.data.gatewayRoutes = data.gatewayRoutes;
      state.data.gatewayConsumers = data.gatewayConsumers;
    }
    if (view === 'incidents') {
      state.data.incidents = (await gql(queries.incidents, {})).incidents;
    }
    if (view === 'monitoring') {
      const data = await gql(queries.monitoring);
      state.data.monitoringRules = data.monitoringRules;
      state.data.monitoringStatus = data.monitoringStatus;
    }
    if (view === 'metrics') {
      state.data.latestMetrics = (await gql(queries.metrics)).latestGatewayMetrics;
    }
    if (view === 'webhooks') {
      const data = await gql(queries.webhooks);
      state.data.webhooks = data.webhooks;
      state.data.webhookDeliveries = data.webhookDeliveries;
      state.data.webhookEventTypes = data.webhookEventTypes;
    }
    if (view === 'messenger') {
      const data = await gql(queries.messenger);
      state.data.messengerEvents = data.messengerEvents;
      state.data.messengerRecipients = data.messengerRecipients;
    }
  } catch (error) {
    state.errors[view] = readError(error);
    showGlobalError(readError(error));
  }
}

function renderCurrentView() {
  const titleMap = {
    overview: 'Operations Overview',
    gateway: 'Gateway Control',
    incidents: 'Incidents',
    monitoring: 'Monitoring Rules',
    metrics: 'Realtime Metrics',
    webhooks: 'Webhooks',
    messenger: 'Messenger Inbound',
    admins: 'Admins',
  };
  document.getElementById('view-title').textContent = titleMap[state.currentView];

  if (state.currentView === 'overview') renderOverview();
  if (state.currentView === 'gateway') renderGateway();
  if (state.currentView === 'incidents') renderIncidents();
  if (state.currentView === 'monitoring') renderMonitoring();
  if (state.currentView === 'metrics') renderMetrics();
  if (state.currentView === 'webhooks') renderWebhooks();
  if (state.currentView === 'messenger') renderMessenger();
  if (state.currentView === 'admins') renderAdmins();
}

function renderOverview() {
  const incidents = state.data.incidents || [];
  const open = incidents.filter((incident) => incident.status !== 'RESOLVED');
  const services = state.data.gatewayServices || [];
  const status = state.data.monitoringStatus;

  setView(`
    <section class="kpi-grid">
      ${kpi('Open incidents', open.length)}
      ${kpi('Gateway services', services.length)}
      ${kpi('Monitoring rules', status?.totalRules ?? 0)}
      ${kpi('Triggered rules', status?.triggeredRules ?? 0)}
    </section>
    <section class="split-grid">
      ${panel('Open Incidents', renderIncidentCards(open.slice(0, 6)))}
      ${panel('Gateway Services', renderServiceCards(services.slice(0, 6)))}
    </section>
  `);
}

function renderGateway() {
  setView(`
    <section class="split-grid">
      ${panel('Create Service', `
        <form id="service-form" class="inline-form">
          <label>Name<input id="service-name" placeholder="openrouter-service" required /></label>
          <label>URL<input id="service-url" placeholder="https://openrouter.ai/api" required /></label>
          <label>Route path<input id="service-path" placeholder="/openrouter" /></label>
          <button type="submit">Create</button>
        </form>
      `)}
      ${panel('Services', renderServiceCards(state.data.gatewayServices))}
    </section>
    <section class="split-grid">
      ${panel('Routes', renderRouteTable(state.data.gatewayRoutes))}
      ${panel('Consumers', renderConsumerTable(state.data.gatewayConsumers))}
    </section>
  `);

  document.getElementById('service-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const routePath = value('service-path');
    const input = {
      name: value('service-name'),
      url: value('service-url'),
      route: routePath ? { paths: [routePath], stripPath: true } : null,
    };
    if (!input.route) delete input.route;
    await gql(mutations.createGatewayService, { input });
    await loadViewData('gateway');
    renderGateway();
  });
}

function renderIncidents() {
  setView(`
    <section class="split-grid">
      ${panel('Create Incident', `
        <form id="incident-form" class="inline-form">
          <label>Service UUID<input id="incident-service" value="22222222-2222-4222-8222-222222222222" required /></label>
          <label>Provider UUID<input id="incident-provider" value="33333333-3333-4333-8333-333333333333" required /></label>
          <label>Reason<input id="incident-reason" placeholder="OpenAI timeout spike" required /></label>
          <label>Severity<select id="incident-severity"><option>LOW</option><option>MEDIUM</option><option selected>HIGH</option><option>CRITICAL</option></select></label>
          <button type="submit">Create</button>
        </form>
      `)}
      ${panel('Incident Room', `
        <p class="muted">Realtime collaboration, presence, chat, ack and resolve are kept in the dedicated incident room frontend.</p>
        <button id="incident-room-panel-button" type="button">Open Incident Room</button>
      `)}
    </section>
    ${panel('All Incidents', renderIncidentCards(state.data.incidents))}
  `);

  document.getElementById('incident-room-panel-button').addEventListener('click', () => {
    openIncidentRoom();
  });
  document.getElementById('incident-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await gql(mutations.createIncident, {
      input: {
        serviceId: value('incident-service'),
        providerId: value('incident-provider'),
        reason: value('incident-reason'),
        severity: value('incident-severity'),
        adminId: state.me?.id ?? 'frontend-admin',
        adminName: state.me?.fullName ?? 'Frontend Admin',
      },
    });
    await loadViewData('incidents');
    renderIncidents();
  });
}

function renderMonitoring() {
  const report = state.data.monitoringStatus;
  setView(`
    <section class="kpi-grid">
      ${kpi('Total rules', report?.totalRules ?? 0)}
      ${kpi('Active rules', report?.activeRules ?? 0)}
      ${kpi('Triggered', report?.triggeredRules ?? 0)}
      ${kpi('Last check', report?.checkedAt ? time(report.checkedAt) : 'Never')}
    </section>
    <section class="split-grid">
      ${panel('Create Rule', `
        <form id="rule-form" class="inline-form">
          <label>Name<input id="rule-name" placeholder="openai-latency-high" required /></label>
          <label>Service name<input id="rule-service" placeholder="openai-svc" required /></label>
          <label>Type<select id="rule-type"><option>ERROR_RATE</option><option selected>LATENCY_P95</option><option>UPSTREAM_HEALTH</option></select></label>
          <label>Threshold<input id="rule-threshold" type="number" step="0.01" value="1000" /></label>
          <label>Severity<select id="rule-severity"><option>LOW</option><option>MEDIUM</option><option selected>HIGH</option><option>CRITICAL</option></select></label>
          <button type="submit">Create</button>
        </form>
        <button class="secondary wide" id="run-check" type="button">Run Check Now</button>
      `)}
      ${panel('Check Results', renderCheckResults(report?.results || []))}
    </section>
    ${panel('Rules', renderRuleTable(state.data.monitoringRules))}
  `);

  document.getElementById('run-check').addEventListener('click', async () => {
    await gql(mutations.runMonitoringCheck);
    await loadViewData('monitoring');
    renderMonitoring();
  });
  document.getElementById('rule-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const type = value('rule-type');
    const threshold = Number(value('rule-threshold'));
    const input = {
      name: value('rule-name'),
      serviceName: value('rule-service'),
      type,
      severity: value('rule-severity'),
      metricWindow: '5m',
      cooldownMinutes: 15,
    };
    if (type === 'ERROR_RATE') input.errorRateThreshold = threshold;
    if (type === 'LATENCY_P95') input.latencyThresholdMs = Math.max(1, Math.round(threshold));
    await gql(mutations.createMonitoringRule, { input });
    await loadViewData('monitoring');
    renderMonitoring();
  });
}

function renderMetrics() {
  setView(`
    <section class="split-grid">
      ${panel('Latest Cached Metrics', renderMetricsCard(state.data.latestMetrics))}
      ${panel('Realtime SSE Stream', `
        <div class="stream-status ${state.sse.connected ? 'ok' : 'warn'}">${state.sse.connected ? 'Connected to /metrics/sse' : 'Waiting for /metrics/sse'}</div>
        <div class="event-log">
          ${state.sse.events.length ? state.sse.events.map(renderEventLog).join('') : '<p class="empty">No SSE metrics events yet.</p>'}
        </div>
      `)}
    </section>
    ${panel('Live Metric Curves', renderMetricCharts(state.sse.samples))}
  `);
}

function renderWebhooks() {
  const eventTypes = state.data.webhookEventTypes || ['INCIDENT_CREATED'];
  setView(`
    <section class="split-grid">
      ${panel('Create Webhook', `
        <form id="webhook-form" class="inline-form">
          <label>Name<input id="webhook-name" placeholder="Slack Incidents" required /></label>
          <label>Provider<select id="webhook-provider"><option>GENERIC</option><option>DISCORD</option><option>SLACK</option></select></label>
          <label>URL<input id="webhook-url" placeholder="https://webhook.site/..." required /></label>
          <label>Event type<select id="webhook-event">${eventTypes.map((eventType) => `<option>${escapeHtml(eventType)}</option>`).join('')}</select></label>
          <button type="submit">Create</button>
        </form>
      `)}
      ${panel('Deliveries', renderDeliveryTable(state.data.webhookDeliveries))}
    </section>
    ${panel('Webhooks', renderWebhookTable(state.data.webhooks))}
  `);

  document.getElementById('webhook-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    await gql(mutations.createWebhook, {
      input: {
        name: value('webhook-name'),
        provider: value('webhook-provider'),
        url: value('webhook-url'),
        eventTypes: [value('webhook-event')],
        isActive: true,
        maxRetries: 3,
      },
    });
    await loadViewData('webhooks');
    renderWebhooks();
  });
}

function renderMessenger() {
  setView(`
    <section class="split-grid">
      ${panel('Recipients', renderRecipients(state.data.messengerRecipients))}
      ${panel('Inbound Events', renderMessengerEvents(state.data.messengerEvents))}
    </section>
  `);
}

function renderAdmins() {
  setView(panel('Admins', renderAdminTable(state.data.admins)));
}

function startMetricsSse() {
  if (state.eventSource) return;
  const source = new EventSource('/metrics/sse');
  state.eventSource = source;
  source.onopen = () => {
    state.sse.connected = true;
    updateSseStatus();
  };
  source.onerror = () => {
    state.sse.connected = false;
    updateSseStatus();
  };
  ['metrics.updated', 'metrics.poll.failed', 'health.changed'].forEach((eventName) => {
    source.addEventListener(eventName, (event) => {
      pushSseEvent(eventName, event.data);
    });
  });
  source.onmessage = (event) => pushSseEvent('message', event.data);
}

function stopMetricsSse() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.sse.connected = false;
}

async function openIncidentRoom() {
  try {
    const response = await fetch('/incident-room/index.html', { method: 'HEAD' });
    if (response.ok) {
      window.location.href = '/incident-room/';
      return;
    }
  } catch {
    // Fall through to the standalone Vite dev server.
  }
  window.location.href = 'http://localhost:5173';
}

function pushSseEvent(type, rawData) {
  let parsed = rawData;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    parsed = rawData;
  }
  state.sse.events.unshift({
    type,
    at: new Date().toISOString(),
    data: parsed,
  });
  state.sse.events = state.sse.events.slice(0, 20);
  if (type === 'metrics.updated') {
    recordMetricSample(parsed);
  }
  updateSseStatus();
  if (state.currentView === 'metrics') renderMetrics();
}

function updateSseStatus() {
  const el = document.getElementById('sse-status');
  if (!el) return;
  el.textContent = state.sse.connected ? 'SSE live' : 'SSE offline';
  el.classList.toggle('online', state.sse.connected);
}

function kpi(label, valueText) {
  return `<article class="kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(valueText)}</strong></article>`;
}

function panel(title, content) {
  return `<section class="panel"><div class="panel-header"><h2>${escapeHtml(title)}</h2></div>${content}</section>`;
}

function renderServiceCards(services = []) {
  if (!services.length) return '<p class="empty">No services loaded.</p>';
  return `<div class="card-list">${services.map((service) => `
    <article class="item-card">
      <strong>${escapeHtml(service.name || service.id || 'Unnamed service')}</strong>
      <span>${escapeHtml(service.url || service.host || 'No URL')}</span>
      <small>${escapeHtml(service.protocol || '')} ${escapeHtml(service.path || '')}</small>
    </article>
  `).join('')}</div>`;
}

function renderIncidentCards(incidents = []) {
  if (!incidents.length) return '<p class="empty">No incidents found.</p>';
  return `<div class="card-list">${incidents.map((incident) => `
    <article class="item-card">
      <div class="item-line">
        <strong>${escapeHtml(incident.reason)}</strong>
        <span class="badge ${String(incident.status).toLowerCase()}">${escapeHtml(incident.status)}</span>
      </div>
      <span>${escapeHtml(incident.severity)} · ${time(incident.createdAt)}</span>
      <small>${escapeHtml(incident.id)}</small>
    </article>
  `).join('')}</div>`;
}

function renderRouteTable(routes = []) {
  return table(['Name', 'Paths', 'Methods', 'Strip'], routes.map((route) => [
    route.name || route.id || '-',
    (route.paths || []).join(', '),
    (route.methods || []).join(', ') || 'ANY',
    route.stripPath ? 'yes' : 'no',
  ]));
}

function renderConsumerTable(consumers = []) {
  return table(['Username', 'Custom ID', 'API key'], consumers.map((consumer) => [
    consumer.username || consumer.id || '-',
    consumer.customId || '-',
    consumer.apiKey || '-',
  ]));
}

function renderRuleTable(rules = []) {
  return table(['Name', 'Service', 'Type', 'Severity', 'Active'], rules.map((rule) => [
    rule.name,
    rule.serviceName,
    rule.type,
    rule.severity,
    rule.isActive ? 'yes' : 'no',
  ]));
}

function renderCheckResults(results = []) {
  return table(['Rule', 'Value', 'Threshold', 'State'], results.map((result) => [
    result.ruleName,
    String(result.currentValue),
    String(result.threshold),
    result.triggered ? `Triggered: ${result.reason || ''}` : 'OK',
  ]));
}

function renderMetricsCard(metrics) {
  if (!metrics) return '<p class="empty">No cached metrics yet. Wait for Prometheus polling or check SSE events.</p>';
  return `
    <div class="metrics-grid">
      ${kpi('Total requests', formatCount(metrics.totalRequests))}
      ${kpi('Requests/sec', formatRate(metrics.requestsPerSecond))}
      ${kpi('P95 latency', formatLatency(metrics.latency?.p95))}
      ${kpi('P99 latency', formatLatency(metrics.latency?.p99))}
    </div>
    ${table(['Status', 'Count'], metrics.statusCodes.map((item) => [item.code, String(item.count)]))}
  `;
}

function renderMetricCharts(samples = []) {
  if (samples.length < 2) {
    return '<p class="empty">Waiting for at least two metrics events to draw live curves.</p>';
  }

  return `
    <div class="chart-grid">
      ${lineChart('Requests/sec', samples, [
        { label: 'Requests/sec', key: 'requestsPerSecond', color: '#0d5f7d', format: formatRate },
      ])}
      ${lineChart('Requests over 5m', samples, [
        { label: 'Total requests', key: 'totalRequests', color: '#8f5700', format: formatCount },
      ])}
      ${lineChart('Latency percentiles', samples, [
        { label: 'P50', key: 'latencyP50', color: '#22633a', format: formatLatency },
        { label: 'P95', key: 'latencyP95', color: '#0b5872', format: formatLatency },
        { label: 'P99', key: 'latencyP99', color: '#9f2f2f', format: formatLatency },
      ])}
    </div>
  `;
}

function lineChart(title, samples, series) {
  const width = 640;
  const height = 220;
  const padding = { top: 18, right: 18, bottom: 28, left: 44 };
  const finiteValues = series.flatMap((item) =>
    samples.map((sample) => sample[item.key]).filter((value) => Number.isFinite(value)),
  );

  if (finiteValues.length === 0) {
    return `<article class="chart-card"><h3>${escapeHtml(title)}</h3><p class="empty">No finite values yet.</p></article>`;
  }

  const min = Math.min(0, ...finiteValues);
  const max = Math.max(...finiteValues);
  const domain = max === min ? 1 : max - min;
  const pointsFor = (item) => samples
    .map((sample, index) => {
      const value = sample[item.key];
      if (!Number.isFinite(value)) return null;
      const x = padding.left + (index / Math.max(samples.length - 1, 1)) * (width - padding.left - padding.right);
      const y = padding.top + ((max - value) / domain) * (height - padding.top - padding.bottom);
      return `${roundForSvg(x)},${roundForSvg(y)}`;
    })
    .filter(Boolean)
    .join(' ');

  const latest = samples[samples.length - 1];

  return `
    <article class="chart-card">
      <div class="chart-head">
        <h3>${escapeHtml(title)}</h3>
        <small>${time(latest.at)}</small>
      </div>
      <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)} chart">
        <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" />
        <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" />
        ${series.map((item) => `<polyline points="${pointsFor(item)}" style="--line-color:${item.color}" />`).join('')}
      </svg>
      <div class="chart-legend">
        ${series.map((item) => `
          <span><i style="--legend-color:${item.color}"></i>${escapeHtml(item.label)} <strong>${escapeHtml(item.format(latest[item.key]))}</strong></span>
        `).join('')}
      </div>
    </article>
  `;
}

function recordMetricSample(payload) {
  const metrics = payload?.metrics;
  if (!metrics) return;

  const sample = {
    at: payload.timestamp || new Date().toISOString(),
    totalRequests: finiteNumber(metrics.totalRequests),
    requestsPerSecond: finiteNumber(metrics.requestsPerSecond),
    latencyP50: finiteNumber(metrics.latency?.p50),
    latencyP95: finiteNumber(metrics.latency?.p95),
    latencyP99: finiteNumber(metrics.latency?.p99),
  };

  state.sse.samples.push(sample);
  state.sse.samples = state.sse.samples.slice(-60);
  state.data.latestMetrics = normalizeGatewayMetrics(metrics);
}

function normalizeGatewayMetrics(metrics) {
  return {
    totalRequests: finiteNumber(metrics?.totalRequests) ?? 0,
    requestsPerSecond: finiteNumber(metrics?.requestsPerSecond) ?? 0,
    statusCodes: normalizeStatusCodes(metrics?.statusCodes),
    latency: {
      p50: finiteNumber(metrics?.latency?.p50),
      p95: finiteNumber(metrics?.latency?.p95),
      p99: finiteNumber(metrics?.latency?.p99),
    },
  };
}

function normalizeStatusCodes(statusCodes) {
  if (Array.isArray(statusCodes)) {
    return statusCodes.map((item) => ({
      code: String(item.code),
      count: finiteNumber(item.count) ?? 0,
    }));
  }

  if (!statusCodes || typeof statusCodes !== 'object') {
    return [];
  }

  return Object.entries(statusCodes).map(([code, count]) => ({
    code,
    count: finiteNumber(count) ?? 0,
  }));
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatCount(value) {
  const number = finiteNumber(value);
  return number === null ? 'N/A' : String(Math.round(number));
}

function formatRate(value) {
  const number = finiteNumber(value);
  if (number === null) return 'N/A';
  if (number === 0) return '0';
  if (Math.abs(number) < 1) return number.toFixed(3);
  return number.toFixed(2);
}

function formatLatency(value) {
  const number = finiteNumber(value);
  if (number === null) return 'N/A';
  if (number >= 1000) return `${(number / 1000).toFixed(2)}s`;
  return `${Math.round(number)}ms`;
}

function roundForSvg(value) {
  return Number(value).toFixed(2);
}

function renderEventLog(event) {
  return `
    <article class="event-row">
      <strong>${escapeHtml(event.type)}</strong>
      <small>${time(event.at)}</small>
      <pre>${escapeHtml(JSON.stringify(event.data, null, 2))}</pre>
    </article>
  `;
}

function renderWebhookTable(webhooks = []) {
  return table(['Name', 'Provider', 'Events', 'Active', 'URL'], webhooks.map((webhook) => [
    webhook.name,
    webhook.provider,
    webhook.eventTypes.join(', '),
    webhook.isActive ? 'yes' : 'no',
    webhook.url,
  ]));
}

function renderDeliveryTable(deliveries = []) {
  return table(['Webhook', 'Event', 'Status', 'Attempts', 'Created'], deliveries.map((delivery) => [
    delivery.webhookId,
    delivery.eventType,
    delivery.status,
    String(delivery.attemptCount),
    time(delivery.createdAt),
  ]));
}

function renderRecipients(recipients = []) {
  return table(['Sender', 'Last message', 'Last seen'], recipients.map((recipient) => [
    recipient.senderId,
    recipient.lastMessageText || '-',
    time(recipient.lastSeenAt),
  ]));
}

function renderMessengerEvents(events = []) {
  return table(['Sender', 'Message', 'Postback', 'Received'], events.map((event) => [
    event.senderId || '-',
    event.messageText || '-',
    event.postbackPayload || '-',
    time(event.receivedAt),
  ]));
}

function renderAdminTable(admins = []) {
  return table(['Name', 'Email', 'Role', 'Status', 'Created'], admins.map((admin) => [
    admin.fullName,
    admin.email,
    admin.role,
    admin.status || '-',
    time(admin.createdAt),
  ]));
}

function table(headers, rows) {
  if (!rows.length) return '<p class="empty">No data.</p>';
  return `
    <div class="table-wrapper">
      <table>
        <thead><tr>${headers.map((head) => `<th>${escapeHtml(head)}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function setView(html) {
  document.getElementById('view').innerHTML = html;
}

function showInlineError(message) {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

function showGlobalError(message) {
  const el = document.getElementById('global-error');
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function time(valueText) {
  if (!valueText) return '-';
  const date = new Date(valueText);
  return Number.isNaN(date.getTime()) ? String(valueText) : date.toLocaleString();
}

function readError(error) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

function escapeHtml(valueText) {
  return String(valueText ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function render() {
  const path = window.location.pathname;
  if (path === '/' || path === '/login') return renderLogin();
  if (path === '/register') return renderRegister();
  return renderDashboard();
}

window.addEventListener('popstate', render);
render();
