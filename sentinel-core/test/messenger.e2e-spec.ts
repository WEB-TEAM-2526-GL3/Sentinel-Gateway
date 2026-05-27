import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface MessengerEventResponse {
  id: string;
  senderId?: string;
  recipientId?: string;
  messageText?: string;
  postbackPayload?: string | null;
  timestamp?: string;
  receivedAt: string;
}

interface MessengerRecipientResponse {
  senderId: string;
  lastMessageText?: string;
  lastSeenAt: string;
}

describe('MessengerWebhookController (e2e)', () => {
  let app: INestApplication<App>;
  const originalVerifyToken = process.env.MESSENGER_VERIFY_TOKEN;

  beforeEach(async () => {
    process.env.MESSENGER_VERIFY_TOKEN = 'sentinel_messenger_verify_token';

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

    if (originalVerifyToken === undefined) {
      delete process.env.MESSENGER_VERIFY_TOKEN;
    } else {
      process.env.MESSENGER_VERIFY_TOKEN = originalVerifyToken;
    }
  });

  it('GET /messenger/webhook returns exact challenge with valid token', async () => {
    const response = await request(app.getHttpServer())
      .get('/messenger/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'sentinel_messenger_verify_token',
        'hub.challenge': '123456',
      })
      .expect(200);

    expect(response.text).toBe('123456');
    expect(response.body).toEqual({});
  });

  it('GET /messenger/webhook returns 403 with invalid token', async () => {
    await request(app.getHttpServer())
      .get('/messenger/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': '123456',
      })
      .expect(403);
  });

  it('POST /messenger/webhook returns EVENT_RECEIVED and stores sender id', async () => {
    const response = await request(app.getHttpServer())
      .post('/messenger/webhook')
      .send(createMessengerBody())
      .expect(200);

    expect(response.text).toBe('EVENT_RECEIVED');

    const eventsResponse = await request(app.getHttpServer())
      .get('/messenger/events')
      .expect(200);

    const events = eventsResponse.body as MessengerEventResponse[];

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: 'msg_evt_001',
      senderId: 'PSID_USER_ID',
      recipientId: 'PAGE_ID',
      messageText: 'hello',
      postbackPayload: null,
    });
    expect(events[0].timestamp).toBe('2024-03-09T16:00:00.000Z');
  });

  it('GET /messenger/events filters by senderId and limit', async () => {
    await request(app.getHttpServer())
      .post('/messenger/webhook')
      .send(createMessengerBody('PSID_USER_ID', 'hello'))
      .expect(200);

    await request(app.getHttpServer())
      .post('/messenger/webhook')
      .send(createMessengerBody('OTHER_PSID', 'ignored'))
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/messenger/events?senderId=PSID_USER_ID&limit=1')
      .expect(200);

    const events = response.body as MessengerEventResponse[];

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      senderId: 'PSID_USER_ID',
      messageText: 'hello',
    });
  });

  it('GET /messenger/recipients returns known PSIDs', async () => {
    await request(app.getHttpServer())
      .post('/messenger/webhook')
      .send(createMessengerBody('PSID_USER_ID', 'hello'))
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/messenger/recipients')
      .expect(200);

    const recipients = response.body as MessengerRecipientResponse[];

    expect(recipients).toHaveLength(1);
    expect(recipients[0]).toMatchObject({
      senderId: 'PSID_USER_ID',
      lastMessageText: 'hello',
    });
    expect(recipients[0].lastSeenAt).toEqual(expect.any(String));
  });
});

function createMessengerBody(senderId = 'PSID_USER_ID', text = 'hello') {
  return {
    object: 'page',
    entry: [
      {
        id: 'PAGE_ID',
        time: 1710000000000,
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: 'PAGE_ID' },
            timestamp: 1710000000000,
            message: {
              mid: 'm_123',
              text,
            },
          },
        ],
      },
    ],
  };
}
