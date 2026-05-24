# Kong Adapter

Internal NestJS service wrapping Kong Admin API. Other team members inject `KongAdapterService` instead of talking to Kong directly.

## Start the Stack

```bash
# Start Kong + Postgres
docker compose up -d

# Verify Kong is ready
curl -s http://localhost:8001/ | jq .version
# → "3.4.2"
```

## Inject the Adapter

```typescript
// In your module:
import { KongAdapterModule } from './kong-adapter/kong-adapter.module'

@Module({
  imports: [KongAdapterModule],
  // ...
})
export class YourModule {}

// In your service:
import { KongAdapterService } from './kong-adapter/kong-adapter.service'

@Injectable()
export class YourService {
  constructor(private readonly kong: KongAdapterService) {}
}
```

## Methods

### `init(): Promise<void>`

Call once on startup. Idempotently enables required global plugins (key-auth, prometheus) if not already present.

### `createService(name, url): Promise<KongService>`

Creates a service pointing to an upstream URL.

```typescript
await kong.createService('openai', 'https://api.openai.com')
await kong.createService('stripe', 'https://api.stripe.com')
```

### `getService(name): Promise<KongService>`

```typescript
const svc = await kong.getService('openai')
```

### `listServices(): Promise<KongService[]>`

```typescript
const all = await kong.listServices()
```

### `deleteService(name): Promise<void>`

Deletes a service. Fails if it has routes — delete those first.

```typescript
await kong.deleteService('openai')
```

### `updateServiceUrl(name, newUrl): Promise<void>`

Changes the upstream URL. Used for failover — swap OpenAI → Gemini.

```typescript
await kong.updateServiceUrl('chat-service', 'https://api.gemini.com')
```

### `createRoute(serviceName, paths, options?): Promise<KongRoute>`

Attaches a route to a service.

```typescript
await kong.createRoute('openai', ['/v1/chat'], {
  stripPath: false,
  methods: ['POST'],
  name: 'chat-completions',
})
```

### `createConsumer(username): Promise<KongConsumer>`

Creates an auth identity.

```typescript
const consumer = await kong.createConsumer('my-app')
```

### `createApiKey(consumerUsername, key?): Promise<KongApiKey>`

Creates an API key for a consumer. If `key` is omitted, Kong auto-generates one.

```typescript
const cred = await kong.createApiKey('my-app', 'sk-abc123')
// cred.key → 'sk-abc123'

const auto = await kong.createApiKey('my-app')
// auto.key → auto-generated string
```

### `enableKeyAuth(serviceName): Promise<void>`

Enables key-auth plugin on a service. Idempotent — skips if already enabled.

```typescript
await kong.enableKeyAuth('openai')
// Requests to /openai/* now require ?apikey= or apikey: header
```

### `ping(): Promise<KongNodeInfo>`

Health check — returns node info, version, available plugins.

```typescript
const info = await kong.ping()
// info.version → '3.4.2'
// info.plugins.available_on_server → { 'key-auth': {...}, ... }
```

## Types

All types are in `kong-adapter.types.ts`:

```typescript
interface KongService {
  id: string; name: string; host: string; port: number;
  path: string | null; protocol: string; enabled: boolean;
  created_at: number; updated_at: number;
}

interface KongRoute {
  id: string; name: string | null; paths: string[];
  strip_path: boolean; methods: string[] | null; hosts: string[] | null;
  service: { id: string };
}

interface KongConsumer {
  id: string; username: string | null; created_at: number;
}

interface KongApiKey {
  id: string; key: string; consumer: { id: string };
}

interface KongNodeInfo {
  version: string; hostname: string; node_id: string;
  plugins: { available_on_server: Record<string, any> };
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KONG_ADMIN_URL` | `http://localhost:8001` | Kong Admin API base URL |
| `KONG_PROXY_URL` | `http://localhost:8000` | Kong Proxy URL |

## Error Handling

All methods throw NestJS `HttpException` on failure (Kong returns standard HTTP codes). Common cases:

| Scenario | HTTP | Effect |
|----------|------|--------|
| Service already exists | `409` | `HttpException` thrown |
| Service not found | `404` | `HttpException` thrown |
| Delete with active routes | `400` | Cascade error |
| Kong unreachable | `503` | Connection refused |
