# Sentinel Gateway — Architecture Overview (Front to Back)

> Current state: `origin/main` at commit `f7257c1` (29 May 2026)

---

## Use Cases

1. **Admin registers/logs in** → JWT issued, all subsequent actions authenticated
2. **Admin registers a provider (e.g. OpenAI) in Kong** → Sentinel creates a Kong service + route + injects the API key as a header plugin
3. **Admin creates a consumer (internal team)** → Sentinel creates a Kong consumer + key-auth credential, returns the API key
4. **Admin ACLs a consumer to a route** → route gets ACL plugin, consumer gets ACL group membership
5. **Admin sets a monitoring rule** (error rate > 10%, p95 > 500ms) → rule stored in Postgres
6. **Prometheus scrapes Kong /metrics every 15s** → Sentinel polls Prometheus every 15s, caches GatewayMetrics, tracks health
7. **Monitoring detects threshold breach** → emits event → IncidentsService creates incident → `incident.created` event fires
8. **Webhook listener picks up `incident.created`** → formats Slack/Discord payload → POSTs to webhook URL with HMAC signature
9. **Admins collaborate in real-time** → join WebSocket room, see presence, chat ack/resolve
10. **External alert arrives via Facebook Messenger** → POST `/messenger/webhook` stored in memory, readable via REST/GraphQL
11. **Dashboard overview** via GraphQL or SSE — open incidents, services, monitoring status

---

## Endpoints by Protocol

### REST (`/:3000`)

| Prefix | Auth | What |
|--------|------|------|
| `POST /auth/register` | CEO secret | Create admin |
| `POST /auth/login` | None | Get JWT |
| `GET /auth/me` | JWT | Profile |
| `DELETE /auth/admins/:id` | JWT + CEO secret | Deactivate |
| `GET/POST /gateway/services` | JWT | List/Create Kong services |
| `GET/PATCH/DELETE /gateway/services/:id` | JWT | CRUD service |
| `POST /gateway/services/:id/api-key` | JWT | Inject Bearer token header plugin |
| `POST /gateway/services/:id/header` | JWT | Add custom header plugin |
| `POST /gateway/services/:id/routes` | JWT | Create route on service |
| `GET/PATCH/DELETE /gateway/routes/:id` | JWT | CRUD route |
| `POST/DELETE /gateway/routes/:rid/consumers/:cid` | JWT | ACL allow/revoke |
| `POST/GET /gateway/consumers` | JWT | Create/List |
| `GET/PATCH/DELETE /gateway/consumers/:id` | JWT | CRUD consumer |
| `POST/GET /incidents` | None (*) | Create/List |
| `GET /incidents/:id` | None | Snapshot with logs |
| `GET /incidents/sse` | None | SSE stream of `incident.created` |
| `POST/GET /monitoring/rules` | JWT | CRUD rules |
| `PATCH/DELETE /monitoring/rules/:id` | JWT | Update/Delete |
| `POST /monitoring/check` | JWT | Manual check |
| `GET /monitoring/status` | JWT | Last report |
| `POST/GET /webhooks` | `X-Sentinel-Admin-Key` | CRUD webhook configs |
| `PATCH/DELETE /webhooks/:id` | Admin key | Update/Deactivate |
| `POST /webhooks/:id/test` | Admin key | Send test |
| `POST /webhooks/emit` | None | Internal event emit |
| `GET /webhook-deliveries` | Admin key | Delivery history |
| `GET/POST /messenger/webhook` | Verify token | Facebook callback |
| `GET /messenger/events` | None | Stored events |
| `GET /messenger/recipients` | None | Known senders |
| `GET /metrics/sse` | None | SSE stream of `metrics.updated`, `health.changed`, `metrics.poll.failed` |

### GraphQL (`/graphql`)

One resolver (`SentinelGraphqlResolver`) wrapping **all** services:

**Queries:** `graphqlHealth`, `me`, `admins`, `dashboardOverview` (open incidents + services + monitoring status), `gatewayServices`, `gatewayService(id)`, `gatewayRoutes`, `gatewayRoute(id)`, `gatewayConsumers`, `gatewayConsumer(id)`, `incidents(status?)`, `incident(id)`, `monitoringRules`, `monitoringRule(id)`, `monitoringStatus`, `gatewayMetrics(scope?, range?)`, `latestGatewayMetrics(scope?)`, `serviceHealth(serviceId)`, `webhooks`, `webhook(id)`, `webhookEventTypes`, `webhookDeliveries`, `messengerEvents`, `messengerRecipients`

**Mutations:** `login`, `register`, `logout`, `deactivateAdmin`, `createGatewayService`, `updateGatewayService`, `deleteGatewayService`, `addServiceApiKey`, `addServiceHeader`, `createGatewayRoute`, `updateGatewayRoute`, `deleteGatewayRoute`, `createGatewayConsumer`, `updateGatewayConsumer`, `deleteGatewayConsumer`, `allowConsumerForRoute`, `revokeConsumerFromRoute`, `createIncident`, `sendIncidentMessage`, `ackIncident`, `resolveIncident`, `createMonitoringRule`, `updateMonitoringRule`, `deleteMonitoringRule`, `runMonitoringCheck`, `createWebhook`, `updateWebhook`, `deactivateWebhook`, `testWebhook`, `emitWebhookEvent`

All guarded by `GqlJwtAuthGuard` (except `login`/`register`).

### WebSocket — Socket.IO (`/incident-room`)

**Client → Server:** `joinIncident`, `leaveIncident`, `sendMessage`, `ackIncident`, `resolveIncident`
**Server → Client:** `incidentJoined` (snapshot + presence), `presenceUpdated`, `incidentMessage`, `incidentUpdated`, `incidentError`

### SSE (Server-Sent Events)

Two SSE endpoints:
- `GET /incidents/sse` — streams `incident.created` events
- `GET /metrics/sse` — streams `metrics.updated`, `health.changed`, `metrics.poll.failed` events

---

## Main Services + Event Bus

### Internal Events (EventEmitter2)

```
MonitoringService ──→ monitoring.threshold.exceeded ──→ IncidentsService
MetricsService    ──→ metrics.updated        ──→ (consumed by SSE)
MetricsService    ──→ health.changed         ──→ (consumed by SSE)
MetricsService    ──→ metrics.poll.failed    ──→ (consumed by SSE)
IncidentsService  ──→ incident.created       ──→ WebhookListener + SSE
```

### Service Dependency Graph

**GatewayService** ──→ Kong Admin API (:8001) via generated SDK
- `createService` + route atomically
- `addHeaderToService` / `addBearerTokenToService` (request-transformer plugin)
- `protectRouteWithAcl` (ACL plugin) + `addConsumerToRoute` / `removeConsumerFromRoute`
- list/get/update/delete services, routes
- `createConsumer` (key-auth credential auto-created), list/get/update/delete

**PrometheusService** ──→ Prometheus HTTP API (:9090)
- `queryGatewayMetrics(filter, range)` → PromQL for requests, rate, status codes, latency percentiles
- `queryScalar` / `queryRange`

**MetricsService**
- polls PrometheusService every 15s via setInterval
- caches GatewayMetrics per scope (consumer:service)
- tracks error windows per service (5xx/429 → consecutive counter)
- emits `metrics.updated` / `metrics.poll.failed` / `health.changed`
- exposes `getLatest(scope)`, `getServiceHealth(serviceId)`

**MonitoringService**
- polls via MetricsService every 60s
- evaluates active rules against current metrics
- respects per-rule cooldown
- emits `monitoring.threshold.exceeded`

**IncidentsService**
- listens to `monitoring.threshold.exceeded` → auto-creates incident
- emits `incident.created`
- CRUD + status transitions (open → acknowledged → resolved)
- logs all actions (created, message, ack, resolve)

**WebhooksService**
- in-memory webhook config + delivery history
- listens to `incident.created` → formats payload → POSTs to matched webhooks
- supports GENERIC / DISCORD / SLACK formatters
- HMAC-SHA256 signing, retry with backoff

**AuthService**
- register (bcrypt hash + CEO_SECRET check), login (bcrypt compare + JWT sign)
- JWT expiry configurable via env

**MessengerWebhookService**
- GET verification for Facebook callback
- POST receives events → stores in memory

---

## Entities (TypeORM — PostgreSQL)

### `users` (managed by UsersModule)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | auto |
| email | VARCHAR UK | unique |
| fullName | VARCHAR | |
| passwordHash | VARCHAR | bcrypt |
| role | ENUM | ADMIN |
| status | ENUM | ACTIVE / INACTIVE |
| createdAt/updatedAt | timestamp | auto |

### `incidents` (managed by IncidentsModule)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| serviceId | VARCHAR | Kong service name/ID |
| providerId | VARCHAR | upstream provider ID |
| severity | ENUM | LOW/MEDIUM/HIGH/CRITICAL |
| reason | TEXT | human-readable |
| status | ENUM | OPEN/ACKNOWLEDGED/RESOLVED |
| createdAt/updatedAt | timestamp | |
| resolvedAt | timestamp nullable | |

### `incident_logs` (managed by IncidentsModule)

| Column | Type | Notes |
|--------|------|-------|
| id | INT PK | auto |
| incidentId | UUID FK | → incidents(id) CASCADE |
| adminId | VARCHAR | |
| adminName | VARCHAR | |
| action | ENUM | CREATED/MESSAGE/ACKNOWLEDGED/RESOLVED |
| details | JSONB | arbitrary payload |
| createdAt | timestamp | |

### `monitoring_rules` (managed by MonitoringModule)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR UK | unique rule name |
| serviceName | VARCHAR | which Kong service to watch |
| providerId | VARCHAR nullable | optional provider filter |
| type | ENUM | ERROR_RATE / LATENCY_P95 / UPSTREAM_HEALTH |
| errorRateThreshold | DECIMAL nullable | 0–1 |
| latencyThresholdMs | INT nullable | in ms |
| metricWindow | VARCHAR | e.g. "5m" |
| cooldownMinutes | INT | silence period (default 15) |
| severity | ENUM | LOW/MEDIUM/HIGH/CRITICAL |
| isActive | BOOLEAN | default true |
| lastTriggeredAt | timestamp nullable | |
| createdAt/updatedAt | timestamp | |

---

## Prometheus — What It Does

```
Kong exports metrics at :8001/metrics (prometheus plugin)
       │
       ▼
Prometheus scrapes every 15s (configured in prometheus.yml)
       │
       ▼
Sentinel PrometheusService queries Prometheus HTTP API every 15s
  ├── /api/v1/query with PromQL
  ├── buildServiceLabels(filter) — maps consumerId/serviceId → Kong service label selectors
  └── Returns normalized GatewayMetrics: { totalRequests, requestsPerSecond, statusCodes, latency: { p50, p95, p99 } }
```

**PromQL examples it executes:**

| Metric | PromQL |
|--------|--------|
| totalRequests | `sum(increase(kong_http_requests_total{service="..."}[5m]))` |
| req/s | `sum(rate(kong_http_requests_total{service="..."}[5m]))` |
| status codes | `sum by (code) (increase(kong_http_status{service="..."}[5m]))` |
| p95 latency | `histogram_quantile(0.95, sum(rate(kong_upstream_latency_ms_bucket{...}[5m])) by (le))` |

**Label scoping:**
- `consumerId + serviceId` → `{service="consumerId-serviceId-svc"}`
- `consumerId only` → `{service=~"consumerId-.*"}`
- `serviceId only` → `{service=~".*-serviceId-svc"}`
- neither → global (no label filter)

---

## Kong Wrapper (GatewayService + Generated SDK) — What It Does

The `gateway/` module contains a **generated OpenAPI client** (`@hey-api/openapi-ts` from Kong's spec) in `gateway/kong-client/`. `GatewayService` wraps it behind a `raw()` helper that catches errors and returns HTTP-friendly 400s.

### What it does:

1. **Service management** — `POST /services` with optional nested route creation; PATCH updates URL (used for manual failover); GET/DELETE
2. **Header injection** — `addHeaderToService()` → creates `request-transformer` plugin on the service
3. **Bearer token injection** — `addBearerTokenToService(apiKey)` → adds `Authorization: Bearer <key>` header plugin (this is how provider API keys get embedded)
4. **Route management** — CRUD with `strip_path`, methods, hosts, paths
5. **Consumer + key-auth** — `createConsumer()` creates Kong consumer + `key-auth` credential, returns the auto-generated API key
6. **ACL** — `protectRouteWithAcl()` → ACL plugin on route with group `route_{routeId}`; `addConsumerToRoute()` → gives consumer ACL group membership; `removeConsumerFromRoute()` → revokes

All calls go to `localhost:8001` (Kong Admin API).

---

## One-Line Flow Summary

```
Client → Kong :8000 (proxy) → Upstream API (e.g. OpenAI)
Admin → Sentinel :3000 → Kong Admin API :8001 (configure services/routes/consumers)
Prometheus → scrapes Kong :8001/metrics ← Sentinel polls Prometheus :9090
Monitoring → detects anomaly → Event → Incident → Webhook → Slack/Discord
Admins → WebSocket /incident-room → collaborate on incidents
```
