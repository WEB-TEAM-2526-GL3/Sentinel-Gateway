# Incident Room Backend MVP

This folder contains the backend-only MVP for the Sentinel Gateway incident room:
REST endpoints, Socket.IO realtime events, and PostgreSQL persistence.

## What I Built

- `IncidentsModule` wired into the main NestJS app.
- Socket.IO gateway for realtime collaboration.
- TypeORM entities for `incidents` and `incident_logs`.
- Incident state machine: `OPEN -> ACKNOWLEDGED -> RESOLVED`.
- Audit log entries for create, chat, acknowledge, resolve, and fallback.
- Kong fallback hook through `KongAdapterService.activateFallback()`.
- Unit, Socket.IO gateway, and REST e2e tests.

## Course WebSocket Methods Followed

- Used `@WebSocketGateway()` to create the gateway.
- Configured namespace `/incident-room`.
- Enabled CORS in the gateway options.
- Used `@SubscribeMessage()` for client events.
- Used `@MessageBody()` to read event payloads.
- Used `@ConnectedSocket()` to access the client socket.
- Used `@WebSocketServer()` to access the Socket.IO server.
- Used Socket.IO rooms: `incident:{incidentId}`.
- Used client emits for actions and server emits for room updates.

## Database Behavior

- Runtime uses Docker PostgreSQL through TypeORM.
- Defaults: `localhost:5433`, `sentinel_gateway`, `sentinel/sentinel`.
- Tests use an in-memory repository when `NODE_ENV=test`.
- Normal app usage persists to PostgreSQL.
- TypeORM creates tables automatically unless `SENTINEL_DB_SYNCHRONIZE=false`.

## REST API

- `POST /incidents` creates an incident.
- `GET /incidents/:id` returns one incident with logs.
- `GET /incidents?status=OPEN` filters incidents by status.
- Created incidents start as `OPEN`.
- Statuses: `OPEN`, `ACKNOWLEDGED`, `RESOLVED`.
- Severities: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

## WebSocket API

- Namespace: `/incident-room`.
- Client emits: `joinIncident`, `leaveIncident`, `sendMessage`.
- Client emits: `ackIncident`, `resolveIncident`, `activateFallback`.
- Server emits: `incidentJoined`, `presenceUpdated`, `incidentMessage`.
- Server emits: `incidentUpdated`, `incidentError`.
- `joinIncident` adds the admin to the incident room.
- `sendMessage` saves and broadcasts a chat/audit log.
- `ackIncident` changes `OPEN` to `ACKNOWLEDGED`.
- `resolveIncident` closes unresolved incidents.
- `activateFallback` updates Kong to a fallback URL.

## Run

```bash
docker compose up -d sentinel-database
cd sentinel-core
npm install
npm run start:dev
```

## Test

```bash
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

## Current Status

- Incident room backend is ready for testing.
- Test it with REST and a Socket.IO client.
- Frontend is still needed for the final dashboard/demo.
- Auth/JWT, Redis/EventBus, SSE, metrics, notifications, and GraphQL are later phases.
