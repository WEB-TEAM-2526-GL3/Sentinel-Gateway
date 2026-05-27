import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface WebhookResponseBody {
  id: string;
  name: string;
  url: string;
  eventTypes: string[];
  isActive: boolean;
  hasSecret: boolean;
  maxRetries: number;
  secret?: string;
}

interface ListResponseBody<T> {
  data: T[];
}

interface EmitResponseBody {
  eventType: string;
  matchedWebhooks: number;
  deliveries: DeliverySummaryBody[];
}

interface DeliverySummaryBody {
  id: string;
  webhookId: string;
  status: string;
  attemptCount: number;
}

interface DeliveryResponseBody {
  id: string;
  webhookId: string;
  eventType: string;
  source?: string;
  payload: Record<string, unknown>;
  status: string;
  attemptCount: number;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
}

interface CapturedRequest {
  headers: IncomingMessage['headers'];
  body: string;
}

interface TestWebhookReceiver {
  url: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

describe('WebhooksController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /webhooks creates a webhook without exposing the secret', async () => {
    const response = await request(app.getHttpServer())
      .post('/webhooks')
      .send({
        name: 'Slack Incidents',
        url: 'https://hooks.slack.com/services/xxx',
        eventTypes: ['INCIDENT_CREATED', 'INCIDENT_RESOLVED'],
        isActive: true,
        secret: 'optional-hmac-secret',
        maxRetries: 3,
      })
      .expect(201);

    const body = response.body as WebhookResponseBody;

    expect(body).toMatchObject({
      id: 'wh_001',
      name: 'Slack Incidents',
      url: 'https://hooks.slack.com/services/xxx',
      eventTypes: ['INCIDENT_CREATED', 'INCIDENT_RESOLVED'],
      isActive: true,
      hasSecret: true,
      maxRetries: 3,
    });
    expect(body.secret).toBeUndefined();
  });

  it('never exposes secret on create, list, get, or patch responses', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/webhooks')
      .send({
        name: 'Secure Webhook',
        url: 'https://example.com/secure',
        eventTypes: ['ADMIN_ACTION'],
        secret: 'top-secret',
      })
      .expect(201);

    const created = createResponse.body as WebhookResponseBody;
    expect(created.secret).toBeUndefined();
    expect(created.hasSecret).toBe(true);

    const listResponse = await request(app.getHttpServer())
      .get('/webhooks')
      .expect(200);
    const listBody = listResponse.body as ListResponseBody<WebhookResponseBody>;
    expect(listBody.data[0].secret).toBeUndefined();
    expect(listBody.data[0].hasSecret).toBe(true);

    const getResponse = await request(app.getHttpServer())
      .get(`/webhooks/${created.id}`)
      .expect(200);
    const fetched = getResponse.body as WebhookResponseBody;
    expect(fetched.secret).toBeUndefined();
    expect(fetched.hasSecret).toBe(true);

    const patchResponse = await request(app.getHttpServer())
      .patch(`/webhooks/${created.id}`)
      .send({ name: 'Renamed Secure Webhook' })
      .expect(200);
    const patched = patchResponse.body as WebhookResponseBody;
    expect(patched.secret).toBeUndefined();
    expect(patched.hasSecret).toBe(true);
  });

  it('GET /webhooks lists webhooks with query filters', async () => {
    await request(app.getHttpServer())
      .post('/webhooks')
      .send({
        name: 'Budget Alerts',
        url: 'https://example.com/webhook',
        eventTypes: ['BUDGET_WARNING'],
        isActive: true,
      });

    const response = await request(app.getHttpServer())
      .get('/webhooks?isActive=true&eventType=BUDGET_WARNING')
      .expect(200);

    const body = response.body as ListResponseBody<WebhookResponseBody>;

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 'wh_001',
      name: 'Budget Alerts',
      eventTypes: ['BUDGET_WARNING'],
      isActive: true,
      hasSecret: false,
    });
  });

  it('GET /webhooks/event-types returns supported event types', async () => {
    const response = await request(app.getHttpServer())
      .get('/webhooks/event-types')
      .expect(200);

    const body = response.body as ListResponseBody<string>;

    expect(body.data).toEqual(
      expect.arrayContaining([
        'INCIDENT_CREATED',
        'INCIDENT_ACKNOWLEDGED',
        'INCIDENT_RESOLVED',
        'FALLBACK_ACTIVATED',
        'PROVIDER_DOWN',
        'PROVIDER_RECOVERED',
        'BUDGET_WARNING',
        'BUDGET_EXCEEDED',
        'ERROR_RATE_HIGH',
        'ADMIN_ACTION',
      ]),
    );
  });

  it('GET /webhooks/event-types is not captured as /webhooks/:id', async () => {
    const response = await request(app.getHttpServer())
      .get('/webhooks/event-types')
      .expect(200);

    const body = response.body as ListResponseBody<string>;

    expect(body.data).toContain('INCIDENT_CREATED');
  });

  it('POST /webhooks/emit returns zero matches when no webhook is subscribed', async () => {
    const response = await request(app.getHttpServer())
      .post('/webhooks/emit')
      .send({
        eventType: 'INCIDENT_CREATED',
        source: 'IncidentModule',
        payload: {
          incidentId: 'inc_001',
          reason: 'OpenAI timeout',
          status: 'OPEN',
        },
      })
      .expect(200);

    const body = response.body as EmitResponseBody;

    expect(body).toEqual({
      eventType: 'INCIDENT_CREATED',
      matchedWebhooks: 0,
      deliveries: [],
    });
  });

  it('POST /webhooks/emit is not captured by /webhooks/:id/test', async () => {
    const response = await request(app.getHttpServer())
      .post('/webhooks/emit')
      .send({
        eventType: 'BUDGET_EXCEEDED',
        source: 'BudgetService',
        payload: { serviceId: 'svc_001' },
      })
      .expect(200);

    const body = response.body as EmitResponseBody;

    expect(body.eventType).toBe('BUDGET_EXCEEDED');
    expect(body.matchedWebhooks).toBe(0);
  });

  it('POST /webhooks/:id/test sends an external payload with HMAC headers', async () => {
    const receiver = await createTestWebhookReceiver();

    try {
      const createResponse = await request(app.getHttpServer())
        .post('/webhooks')
        .send({
          name: 'External Test',
          url: receiver.url,
          eventTypes: ['ADMIN_ACTION'],
          secret: 'test-secret',
          maxRetries: 0,
        })
        .expect(201);

      const created = createResponse.body as WebhookResponseBody;

      const testResponse = await request(app.getHttpServer())
        .post(`/webhooks/${created.id}/test`)
        .send({ payload: { message: 'hello' } })
        .expect(200);

      const delivery = testResponse.body as DeliveryResponseBody;

      expect(delivery).toMatchObject({
        webhookId: created.id,
        eventType: 'ADMIN_ACTION',
        status: 'SUCCESS',
        attemptCount: 1,
        responseStatus: 200,
      });
      expect(receiver.requests).toHaveLength(1);
      expect(receiver.requests[0].headers['x-sentinel-event']).toBe(
        'ADMIN_ACTION',
      );
      expect(receiver.requests[0].headers['x-sentinel-signature']).toEqual(
        expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
      );
      expect(
        JSON.parse(receiver.requests[0].body) as Record<string, unknown>,
      ).toMatchObject({
        event: 'ADMIN_ACTION',
        source: 'WebhookService',
        data: { message: 'hello' },
      });
    } finally {
      await receiver.close();
    }
  });

  it('POST /webhooks/emit delivers only to active matching webhooks', async () => {
    const receiver = await createTestWebhookReceiver();

    try {
      await request(app.getHttpServer())
        .post('/webhooks')
        .send({
          name: 'Active Incident Webhook',
          url: receiver.url,
          eventTypes: ['INCIDENT_CREATED'],
          isActive: true,
          maxRetries: 0,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/webhooks')
        .send({
          name: 'Inactive Incident Webhook',
          url: receiver.url,
          eventTypes: ['INCIDENT_CREATED'],
          isActive: false,
          maxRetries: 0,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/webhooks')
        .send({
          name: 'Active Budget Webhook',
          url: receiver.url,
          eventTypes: ['BUDGET_WARNING'],
          isActive: true,
          maxRetries: 0,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/webhooks/emit')
        .send({
          eventType: 'INCIDENT_CREATED',
          source: 'IncidentModule',
          payload: {
            incidentId: 'inc_001',
            reason: 'OpenAI timeout',
            status: 'OPEN',
            createdAt: '2026-05-26T10:00:00Z',
          },
        })
        .expect(200);

      const body = response.body as EmitResponseBody;

      expect(body.matchedWebhooks).toBe(1);
      expect(body.deliveries).toHaveLength(1);
      expect(body.deliveries[0]).toMatchObject({
        webhookId: 'wh_001',
        status: 'SUCCESS',
        attemptCount: 1,
      });
      expect(receiver.requests).toHaveLength(1);
    } finally {
      await receiver.close();
    }
  });

  it('POST /webhooks/emit records FAILED delivery without failing the request', async () => {
    const receiver = await createTestWebhookReceiver(500, 'provider failed');

    try {
      await request(app.getHttpServer())
        .post('/webhooks')
        .send({
          name: 'Failing Webhook',
          url: receiver.url,
          eventTypes: ['PROVIDER_DOWN'],
          maxRetries: 1,
        })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/webhooks/emit')
        .send({
          eventType: 'PROVIDER_DOWN',
          source: 'FallbackService',
          payload: { providerId: 'openai' },
        })
        .expect(200);

      const body = response.body as EmitResponseBody;

      expect(body.matchedWebhooks).toBe(1);
      expect(body.deliveries[0]).toMatchObject({
        webhookId: 'wh_001',
        status: 'FAILED',
        attemptCount: 2,
      });
      expect(receiver.requests).toHaveLength(2);

      const deliveriesResponse = await request(app.getHttpServer())
        .get('/webhook-deliveries?status=FAILED')
        .expect(200);
      const deliveries =
        deliveriesResponse.body as ListResponseBody<DeliveryResponseBody>;

      expect(deliveries.data[0]).toMatchObject({
        webhookId: 'wh_001',
        eventType: 'PROVIDER_DOWN',
        status: 'FAILED',
        attemptCount: 2,
        responseStatus: 500,
        responseBody: 'provider failed',
        error: 'Webhook returned status 500',
      });
    } finally {
      await receiver.close();
    }
  });

  it('PATCH /webhooks/:id can update isActive and eventTypes', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/webhooks')
      .send({
        name: 'Mutable Webhook',
        url: 'https://example.com/mutable',
        eventTypes: ['INCIDENT_CREATED'],
        isActive: false,
      })
      .expect(201);

    const created = createResponse.body as WebhookResponseBody;

    const patchResponse = await request(app.getHttpServer())
      .patch(`/webhooks/${created.id}`)
      .send({
        isActive: true,
        eventTypes: ['INCIDENT_RESOLVED', 'FALLBACK_ACTIVATED'],
      })
      .expect(200);

    const patched = patchResponse.body as WebhookResponseBody;

    expect(patched).toMatchObject({
      id: created.id,
      isActive: true,
      eventTypes: ['INCIDENT_RESOLVED', 'FALLBACK_ACTIVATED'],
    });
  });

  it('GET /webhook-deliveries filters by status, eventType, and webhookId', async () => {
    const receiver = await createTestWebhookReceiver();

    try {
      const createResponse = await request(app.getHttpServer())
        .post('/webhooks')
        .send({
          name: 'Delivery Filter Webhook',
          url: receiver.url,
          eventTypes: ['INCIDENT_RESOLVED'],
          maxRetries: 0,
        })
        .expect(201);

      const created = createResponse.body as WebhookResponseBody;

      await request(app.getHttpServer())
        .post('/webhooks/emit')
        .send({
          eventType: 'INCIDENT_RESOLVED',
          source: 'IncidentModule',
          payload: { incidentId: 'inc_001', status: 'RESOLVED' },
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(
          `/webhook-deliveries?status=SUCCESS&eventType=INCIDENT_RESOLVED&webhookId=${created.id}`,
        )
        .expect(200);

      const body = response.body as ListResponseBody<DeliveryResponseBody>;

      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({
        webhookId: created.id,
        eventType: 'INCIDENT_RESOLVED',
        status: 'SUCCESS',
        responseStatus: 200,
      });
    } finally {
      await receiver.close();
    }
  });

  it('DELETE /webhooks/:id deactivates a webhook', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/webhooks')
      .send({
        name: 'Incident Notifications',
        url: 'https://example.com/incidents',
        eventTypes: ['INCIDENT_CREATED'],
        isActive: true,
      })
      .expect(201);

    const createdWebhook = createResponse.body as WebhookResponseBody;

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/webhooks/${createdWebhook.id}`)
      .expect(200);

    const deletedWebhook = deleteResponse.body as WebhookResponseBody;

    expect(deletedWebhook).toMatchObject({
      id: createdWebhook.id,
      isActive: false,
    });

    const listResponse = await request(app.getHttpServer())
      .get('/webhooks?isActive=true')
      .expect(200);

    const listBody = listResponse.body as ListResponseBody<WebhookResponseBody>;

    expect(listBody.data).toHaveLength(0);
  });
});

async function createTestWebhookReceiver(
  statusCode = 200,
  responseBody = 'ok',
): Promise<TestWebhookReceiver> {
  const requests: CapturedRequest[] = [];

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      requests.push({
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.statusCode = statusCode;
      res.end(responseBody);
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Unable to start test webhook receiver');
  }

  return {
    url: `http://127.0.0.1:${address.port}/webhook`,
    requests,
    close: () => closeServer(server),
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
