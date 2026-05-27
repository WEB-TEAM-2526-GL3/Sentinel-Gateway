# Monitoring Controller — Bilel

Auto-detection engine that watches Kong metrics in Prometheus and **emits an event**
when a configured threshold is breached. It does **not** create incidents itself —
that's the Incident Service's job (separate teammate).

```
Metrics Service (Abdelhakim) ──polls──> Monitoring Controller (this) ──event──> Incident Service (Ali)
```

## What's inside

| File | Purpose |
|---|---|
| `entities/monitoring-rule.entity.ts` | DB table `monitoring_rules` — name, service, type, threshold, cooldown, severity |
| `dto/` | Create + update DTOs (class-validator) |
| `enums/incident-severity.enum.ts` | Local severity tag (LOW/MEDIUM/HIGH/CRITICAL) |
| `events/threshold-exceeded.event.ts` | **Public contract** — `ThresholdExceededEvent` on channel `monitoring.threshold.exceeded` |
| `interfaces/check-result.interface.ts` | Typed per-rule + aggregate report shapes |
| `monitoring.service.ts` | Scheduled detection loop, Prometheus queries, cooldown logic, emits event |
| `monitoring.controller.ts` | REST API (JWT-protected) |
| `monitoring.service.spec.ts` | Unit tests |

## How it works

1. Boots a `setInterval` loop (every `MONITORING_INTERVAL_MS`, default 60s).
2. Loads all active rules from DB.
3. For each rule, queries Prometheus (`PROMETHEUS_URL`, default `http://localhost:9090`).
4. Compares the measured value to the rule's threshold.
5. If breached **and** the per-rule cooldown has expired, emits `monitoring.threshold.exceeded` and updates `lastTriggeredAt`.

Three rule types are supported:

| Type | Triggers when… |
|---|---|
| `ERROR_RATE` | 4xx+5xx rate exceeds `errorRateThreshold` (0–1) over `metricWindow` |
| `LATENCY_P95` | p95 upstream latency exceeds `latencyThresholdMs` over `metricWindow` |
| `UPSTREAM_HEALTH` | All upstream targets reported down by Kong |

## REST API

All routes require a valid JWT.

| Verb | Path | Body / Notes |
|---|---|---|
| `POST` | `/monitoring/rules` | `CreateMonitoringRuleDto` — create a rule |
| `GET` | `/monitoring/rules` | list all rules |
| `GET` | `/monitoring/rules/:id` | get one rule |
| `PATCH` | `/monitoring/rules/:id` | `UpdateMonitoringRuleDto` — update (incl. `isActive`) |
| `DELETE` | `/monitoring/rules/:id` | remove a rule |
| `POST` | `/monitoring/check` | run a check now, returns full report |
| `GET` | `/monitoring/status` | last cached check report (404 before first run) |

### Example: create a rule

```http
POST /monitoring/rules
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "name": "openai-error-rate-high",
  "serviceName": "openai-svc",
  "type": "ERROR_RATE",
  "errorRateThreshold": 0.1,
  "metricWindow": "5m",
  "cooldownMinutes": 15,
  "severity": "HIGH"
}
```

## Event contract — for the Incident Service

When a rule fires, this is emitted **once** (cooldown-gated):

- **Channel:** `monitoring.threshold.exceeded`
- **Payload:** `ThresholdExceededEvent` (see `events/threshold-exceeded.event.ts`)

```ts
// In Ali's Incident Service module:
import { OnEvent } from '@nestjs/event-emitter';
import { ThresholdExceededEvent } from '../monitoring/events/threshold-exceeded.event';

@OnEvent('monitoring.threshold.exceeded')
handleAnomaly(event: ThresholdExceededEvent) {
  // open an incident, notify admins, etc.
}
```

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PROMETHEUS_URL` | `http://localhost:9090` | Prometheus HTTP API endpoint |
| `MONITORING_INTERVAL_MS` | `60000` | How often the scheduled check runs |

## Dependencies added to `sentinel-core/package.json`

- `@nestjs/event-emitter` — for the in-process event bus

## Tests

```bash
cd sentinel-core
npm test -- monitoring
```

Covered: rule CRUD (incl. conflict / not-found), threshold evaluation, cooldown gating, event emission shape.

## Notes for the merge

1. `EventEmitterModule.forRoot()` is registered in `monitoring.module.ts`. If another teammate also calls `forRoot()` in their module, **hoist this single line to `AppModule`** so it's registered once globally. No other change needed.
2. This module has zero compile-time dependency on the Incident Service. Communication is purely through the named event channel above.
3. A new table `monitoring_rules` is created on boot via `synchronize: true`.
