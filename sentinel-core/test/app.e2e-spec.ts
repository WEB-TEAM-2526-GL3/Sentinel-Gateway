import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { IncidentSeverity } from '../src/incidents/domain/incident-severity.enum';
import { IncidentStatus } from '../src/incidents/domain/incident-status.enum';

describe('AppController (e2e)', () => {
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

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('creates, fetches, and filters incidents', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/incidents')
      .send({
        serviceId: '22222222-2222-4222-8222-222222222222',
        providerId: '33333333-3333-4333-8333-333333333333',
        severity: IncidentSeverity.HIGH,
        reason: 'OpenAI timeout spike',
        adminId: 'admin-1',
        adminName: 'Admin One',
      })
      .expect(201);

    const incidentId = createResponse.body.incident.id;

    expect(createResponse.body.incident.status).toBe(IncidentStatus.OPEN);
    expect(createResponse.body.logs).toHaveLength(1);

    await request(app.getHttpServer())
      .get(`/incidents/${incidentId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.incident.id).toBe(incidentId);
      });

    await request(app.getHttpServer())
      .get('/incidents')
      .query({ status: IncidentStatus.OPEN })
      .expect(200)
      .expect(({ body }) => {
        expect(body.some((incident) => incident.id === incidentId)).toBe(true);
      });
  });
});
