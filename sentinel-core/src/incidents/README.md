# Incident Room Backend

This package implements the backend slice for the Incident Room feature used by the Sentinel Gateway.

Key changes in this refactor

- The module now follows the same pattern as `UsersModule`: it's thin and registers feature entities via `TypeOrmModule.forFeature([...])`.
- `IncidentsService` extends the shared `GenericService` for CRUD operations and injects TypeORM repositories directly.
- The previous repository abstraction and in-memory repository were removed to reduce indirection.
- Database bootstrap lives at the application level (`AppModule`) through `TypeOrmModule.forRootAsync()`.

Structure

- `incidents.module.ts` — registers feature entities and providers.
- `incidents.service.ts` — business logic; extends `GenericService`.
- `incidents.controller.ts` — REST endpoints (unchanged API surface).
- `incident-room.gateway.ts` — Socket.IO gateway for real-time collaboration.
- `entities/` — `IncidentEntity`, `IncidentLogEntity` TypeORM entities.
- `dto/` — request/response DTOs used by controllers and gateway.
- `enum/` — statuses and severity enums.

Database and runtime

- Database wiring (connection settings, `autoLoadEntities`, `synchronize`) is configured in `AppModule`.
- The incidents feature registers its entities with TypeORM using `forFeature` so the app-level connection manages persistence.

Kong adapter

- Kong-related operations are exposed by the gateway-adapter at `src/gateway-adapter/kong`.
- `activateFallback()` is available to update service routing to a fallback URL.

API (unchanged)

- REST: `POST /incidents`, `GET /incidents`, `GET /incidents/:id`.
- WebSocket namespace: `/incident-room` (events unchanged).

Run

```bash
docker compose up -d sentinel-database
cd sentinel-core
npm install
npm run start:dev
```

Tests

- The previous in-module spec wiring was removed; adapt existing tests to inject TypeORM repositories or use integration/e2e tests against a test DB.

Notes

- Controller routes and payloads were preserved to avoid breaking clients.
- If you want the old in-memory test helper back for fast unit tests, I can add a small test utility that registers mock repositories for `NODE_ENV=test`.

Status: refactored to match `UsersModule` structure; see `src/incidents` for sources.
