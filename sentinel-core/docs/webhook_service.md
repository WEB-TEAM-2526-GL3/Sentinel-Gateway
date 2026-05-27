# WebhookService

## Purpose

`WebhookService` est la facade de notification sortante de Sentinel Gateway.
Il centralise la configuration des webhooks, l'emission des evenements internes
vers des URLs externes, et l'historique des tentatives d'envoi.

Les autres modules ne doivent pas appeler Slack, Discord, PagerDuty ou tout autre
systeme externe directement. Ils doivent passer par `WebhookService`, soit via
l'endpoint REST principal `POST /webhooks/emit`, soit plus tard par injection du
service NestJS quand les modules seront dans la meme application.

## Role Dans L'Architecture

`WebhookService` ne gere pas les incidents, Kong, l'auth globale, les budgets ou
les providers. Il recoit des evenements metier deja construits par les autres
modules et les transmet aux webhooks actifs abonnes au type d'evenement.

Exemples de producteurs attendus :

- `IncidentModule` : incident cree, acquitte, resolu.
- `FallbackService` : fallback active, provider down, provider recovered.
- `BudgetService` : budget warning, budget exceeded.
- Business Logic Layer : actions metier ou evenements d'administration.

## Endpoint Principal

```http
POST /webhooks/emit
Content-Type: application/json
```

Request :

```json
{
  "eventType": "INCIDENT_CREATED",
  "source": "IncidentModule",
  "payload": {
    "incidentId": "inc_001",
    "reason": "OpenAI timeout",
    "status": "OPEN",
    "createdAt": "2026-05-26T10:00:00Z"
  }
}
```

Response :

```json
{
  "eventType": "INCIDENT_CREATED",
  "matchedWebhooks": 1,
  "deliveries": [
    {
      "id": "del_001",
      "webhookId": "wh_001",
      "status": "SUCCESS",
      "attemptCount": 1
    }
  ]
}
```

Si un webhook externe echoue, `/webhooks/emit` ne leve pas une erreur globale.
La reponse contient une delivery `FAILED` pour ce webhook, et les autres
webhooks continuent d'etre traites.

## Payload Sortant

Pour chaque webhook cible, Sentinel envoie :

```json
{
  "event": "INCIDENT_CREATED",
  "source": "IncidentModule",
  "timestamp": "2026-05-26T10:00:00.000Z",
  "data": {
    "incidentId": "inc_001",
    "reason": "OpenAI timeout",
    "status": "OPEN"
  }
}
```

Headers ajoutes :

```text
Content-Type: application/json
X-Sentinel-Event: INCIDENT_CREATED
X-Sentinel-Signature: sha256=<hmac>   # seulement si un secret est configure
```

## Exemples D'Integration

### IncidentModule

```json
{
  "eventType": "INCIDENT_CREATED",
  "source": "IncidentModule",
  "payload": {
    "incidentId": "inc_001",
    "serviceId": "chat-service",
    "providerId": "openai",
    "reason": "OpenAI timeout",
    "status": "OPEN",
    "createdAt": "2026-05-26T10:00:00Z"
  }
}
```

### FallbackService

```json
{
  "eventType": "FALLBACK_ACTIVATED",
  "source": "FallbackService",
  "payload": {
    "serviceId": "chat-service",
    "fromProvider": "openai",
    "toProvider": "gemini",
    "reason": "timeout",
    "activatedAt": "2026-05-26T10:01:00Z"
  }
}
```

### BudgetService

```json
{
  "eventType": "BUDGET_WARNING",
  "source": "BudgetService",
  "payload": {
    "serviceId": "chat-service",
    "currentSpend": 82.5,
    "budgetLimit": 100,
    "thresholdPercent": 80
  }
}
```

## Event Types Supportes

```text
INCIDENT_CREATED
INCIDENT_ACKNOWLEDGED
INCIDENT_RESOLVED
FALLBACK_ACTIVATED
PROVIDER_DOWN
PROVIDER_RECOVERED
BUDGET_WARNING
BUDGET_EXCEEDED
ERROR_RATE_HIGH
ADMIN_ACTION
```

Endpoint de decouverte :

```http
GET /webhooks/event-types
```

Response :

```json
{
  "data": [
    "INCIDENT_CREATED",
    "INCIDENT_ACKNOWLEDGED",
    "INCIDENT_RESOLVED",
    "FALLBACK_ACTIVATED",
    "PROVIDER_DOWN",
    "PROVIDER_RECOVERED",
    "BUDGET_WARNING",
    "BUDGET_EXCEEDED",
    "ERROR_RATE_HIGH",
    "ADMIN_ACTION"
  ]
}
```

## Endpoints Admin

| Methode | Endpoint | Role |
| --- | --- | --- |
| `POST` | `/webhooks` | Creer une configuration webhook |
| `GET` | `/webhooks` | Lister les webhooks |
| `GET` | `/webhooks/event-types` | Lister les types d'evenements |
| `GET` | `/webhooks/:id` | Recuperer un webhook |
| `PATCH` | `/webhooks/:id` | Modifier un webhook |
| `DELETE` | `/webhooks/:id` | Desactiver logiquement un webhook |
| `POST` | `/webhooks/:id/test` | Envoyer un payload de test |
| `POST` | `/webhooks/emit` | Emettre un evenement interne |
| `GET` | `/webhook-deliveries` | Consulter l'historique des envois |

Les routes statiques `/webhooks/event-types` et `/webhooks/emit` sont declarees
avant les routes dynamiques `/:id` pour eviter toute capture incorrecte.

## Creer Un Webhook

```http
POST /webhooks
Content-Type: application/json
```

Request :

```json
{
  "name": "Slack Incidents",
  "url": "https://hooks.slack.com/services/xxx",
  "eventTypes": ["INCIDENT_CREATED", "INCIDENT_RESOLVED"],
  "isActive": true,
  "secret": "optional-hmac-secret",
  "maxRetries": 3
}
```

Response publique :

```json
{
  "id": "wh_001",
  "name": "Slack Incidents",
  "url": "https://hooks.slack.com/services/xxx",
  "eventTypes": ["INCIDENT_CREATED", "INCIDENT_RESOLVED"],
  "isActive": true,
  "hasSecret": true,
  "maxRetries": 3,
  "createdAt": "2026-05-26T10:00:00.000Z",
  "updatedAt": "2026-05-26T10:00:00.000Z"
}
```

Le champ `secret` n'est jamais retourne. Les reponses publiques exposent
uniquement `hasSecret`.

## Lister Les Webhooks

```http
GET /webhooks
GET /webhooks?isActive=true
GET /webhooks?eventType=INCIDENT_CREATED
```

Response :

```json
{
  "data": [
    {
      "id": "wh_001",
      "name": "Slack Incidents",
      "url": "https://hooks.slack.com/services/xxx",
      "eventTypes": ["INCIDENT_CREATED"],
      "isActive": true,
      "hasSecret": true,
      "maxRetries": 3,
      "createdAt": "2026-05-26T10:00:00.000Z",
      "updatedAt": "2026-05-26T10:00:00.000Z"
    }
  ]
}
```

## Modifier Ou Desactiver

```http
PATCH /webhooks/wh_001
Content-Type: application/json
```

```json
{
  "isActive": false,
  "eventTypes": ["FALLBACK_ACTIVATED"]
}
```

`DELETE /webhooks/:id` ne supprime pas physiquement la configuration. Il fait
une desactivation logique en mettant `isActive = false`.

## Tester Un Webhook

```http
POST /webhooks/wh_001/test
Content-Type: application/json
```

```json
{
  "payload": {
    "message": "Test depuis Sentinel Gateway"
  }
}
```

Cet endpoint envoie un evenement `ADMIN_ACTION` vers l'URL configuree et cree
une delivery.

## Deliveries

Chaque tentative d'envoi cree une `WebhookDelivery` :

```json
{
  "id": "del_001",
  "webhookId": "wh_001",
  "eventType": "INCIDENT_CREATED",
  "source": "IncidentModule",
  "payload": {
    "incidentId": "inc_001"
  },
  "status": "SUCCESS",
  "attemptCount": 1,
  "responseStatus": 200,
  "responseBody": "ok",
  "createdAt": "2026-05-26T10:00:00.000Z",
  "deliveredAt": "2026-05-26T10:00:00.100Z"
}
```

Filtres supportes :

```http
GET /webhook-deliveries
GET /webhook-deliveries?status=FAILED
GET /webhook-deliveries?eventType=INCIDENT_CREATED
GET /webhook-deliveries?webhookId=wh_001
```

Statuts possibles :

```text
PENDING
SUCCESS
FAILED
```

`PENDING` est reserve pour une future implementation asynchrone. La V1 execute
les tentatives pendant la requete et enregistre directement `SUCCESS` ou
`FAILED`.

## HMAC

Si un webhook possede un `secret`, Sentinel signe le corps JSON sortant avec
HMAC SHA-256 :

```text
X-Sentinel-Signature: sha256=<hex digest>
```

Le recepteur peut recalculer la signature avec le meme secret et comparer le
digest. Le `secret` est stocke en memoire dans la V1, mais il n'est jamais
retourne dans les reponses HTTP publiques.

## Retry

`maxRetries` controle le nombre de nouvelles tentatives apres l'essai initial.

Exemple :

```text
maxRetries = 0 -> 1 tentative totale
maxRetries = 3 -> 4 tentatives totales
```

La V1 utilise un backoff court pour rester testable rapidement. Une future
version pourra deleguer les retries a une queue.

## Limites Actuelles

- Repository en memoire uniquement.
- Donnees perdues au redemarrage du backend.
- Pas encore de DB applicative.
- Pas encore d'ORM TypeORM/Prisma.
- Pas encore d'AuthModule/JWT.
- Endpoints admin publics tant que l'auth globale n'existe pas.
- Pas encore d'EventBus.
- Pas encore de queue asynchrone pour les retries.
- Pas encore d'integration directe avec `IncidentModule`, `AdminModule` ou
  `BudgetService`, car ces modules ne sont pas encore presents.

## Commandes De Verification

Depuis `sentinel-core/` :

```bash
npm test -- --runInBand
npm run test:e2e -- --runInBand
npx tsc --noEmit -p tsconfig.json
npx eslint "src/webhooks/**/*.ts" "test/webhooks.e2e-spec.ts"
```

Si `npm run build` echoue avec `EPERM` sur `dist` sous Windows/OneDrive alors
que `tsc` passe, il s'agit probablement d'un fichier genere verrouille et non
d'une erreur TypeScript.
