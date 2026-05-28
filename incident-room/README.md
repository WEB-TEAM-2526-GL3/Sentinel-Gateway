# Incident Room Frontend

Small Vite + React UI for Ali's Incident Room backend.

## Run

```bash
cd incident-room
npm install
npm run dev
```

Default backend URL is `http://localhost:3000`.
Override it with `VITE_SENTINEL_API_URL`.

## Backend Needed

```bash
docker compose up -d sentinel-database
cd sentinel-core
npm run start:dev
```

The UI uses REST for incident create/list/detail and Socket.IO for `/incident-room`.
