import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { io, Socket } from 'socket.io-client';
import { KongAdapterService } from '../kong-adapter/kong-adapter.service';
import { IncidentLogAction } from './domain/incident-log-action.enum';
import { IncidentSeverity } from './domain/incident-severity.enum';
import { IncidentsModule } from './incidents.module';
import { IncidentsService } from './incidents.service';

describe('IncidentRoomGateway', () => {
  let app: INestApplication;
  let incidentsService: IncidentsService;
  let kongAdapter: { activateFallback: jest.Mock<Promise<void>, [unknown]> };
  let baseUrl: string;

  beforeEach(async () => {
    kongAdapter = {
      activateFallback: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [IncidentsModule],
    })
      .overrideProvider(KongAdapterService)
      .useValue(kongAdapter)
      .compile();

    app = module.createNestApplication();
    await app.listen(0);
    incidentsService = module.get(IncidentsService);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/incident-room`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('joins an incident and receives the current snapshot', async () => {
    const incidentId = await createIncident();
    const client = await connectClient();

    const joined = waitFor(client, 'incidentJoined');
    client.emit('joinIncident', {
      incidentId,
      adminId: 'admin-1',
      adminName: 'Admin One',
    });

    await expect(joined).resolves.toMatchObject({
      incident: { id: incidentId },
      presence: [{ adminId: 'admin-1', adminName: 'Admin One' }],
    });

    client.disconnect();
  });

  it('broadcasts presence to admins in the same room', async () => {
    const incidentId = await createIncident();
    const first = await connectClient();
    const second = await connectClient();

    first.emit('joinIncident', {
      incidentId,
      adminId: 'admin-1',
      adminName: 'Admin One',
    });
    await waitFor(first, 'incidentJoined');

    const presence = waitFor(first, 'presenceUpdated');
    second.emit('joinIncident', {
      incidentId,
      adminId: 'admin-2',
      adminName: 'Admin Two',
    });

    await expect(presence).resolves.toMatchObject({
      incidentId,
      admins: expect.arrayContaining([
        expect.objectContaining({ adminId: 'admin-1' }),
        expect.objectContaining({ adminId: 'admin-2' }),
      ]),
    });

    first.disconnect();
    second.disconnect();
  });

  it('broadcasts chat messages to the incident room only', async () => {
    const incidentId = await createIncident();
    const otherIncidentId = await createIncident();
    const first = await connectClient();
    const second = await connectClient();
    const outsider = await connectClient();

    await join(first, incidentId, 'admin-1');
    await join(second, incidentId, 'admin-2');
    await join(outsider, otherIncidentId, 'admin-3');

    const message = waitFor(second, 'incidentMessage');
    let outsiderReceived = false;
    outsider.on('incidentMessage', () => {
      outsiderReceived = true;
    });

    first.emit('sendMessage', {
      incidentId,
      adminId: 'admin-1',
      adminName: 'Admin One',
      message: 'Investigating now',
    });

    await expect(message).resolves.toMatchObject({
      action: IncidentLogAction.MESSAGE,
      details: { message: 'Investigating now' },
    });
    expect(outsiderReceived).toBe(false);

    first.disconnect();
    second.disconnect();
    outsider.disconnect();
  });

  it('broadcasts acknowledgements and fallback updates', async () => {
    const incidentId = await createIncident();
    const first = await connectClient();
    const second = await connectClient();

    await join(first, incidentId, 'admin-1');
    await join(second, incidentId, 'admin-2');

    const ackUpdate = waitFor(second, 'incidentUpdated');
    first.emit('ackIncident', {
      incidentId,
      adminId: 'admin-1',
      adminName: 'Admin One',
      notes: 'Taking ownership',
    });
    await expect(ackUpdate).resolves.toMatchObject({
      incident: { status: 'ACKNOWLEDGED' },
    });

    const fallbackUpdate = waitFor(second, 'incidentUpdated');
    first.emit('activateFallback', {
      incidentId,
      adminId: 'admin-1',
      adminName: 'Admin One',
      serviceName: 'openai-service',
      fallbackProviderId: '44444444-4444-4444-8444-444444444444',
      fallbackUrl: 'http://gemini.local',
    });

    await expect(fallbackUpdate).resolves.toMatchObject({
      incident: {
        fallbackProviderId: '44444444-4444-4444-8444-444444444444',
      },
    });
    expect(kongAdapter.activateFallback).toHaveBeenCalled();

    first.disconnect();
    second.disconnect();
  });

  async function createIncident(): Promise<string> {
    const result = await incidentsService.createIncident({
      serviceId: randomUUID(),
      providerId: randomUUID(),
      severity: IncidentSeverity.HIGH,
      reason: 'OpenAI timeout spike',
      adminId: 'admin-1',
      adminName: 'Admin One',
    });

    return result.incident.id;
  }

  async function connectClient(): Promise<Socket> {
    const client = io(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    await waitFor(client, 'connect');
    return client;
  }

  async function join(
    client: Socket,
    incidentId: string,
    adminId: string,
  ): Promise<void> {
    const suffix = adminId.split('-').at(-1);
    const joined = waitFor(client, 'incidentJoined');
    client.emit('joinIncident', {
      incidentId,
      adminId,
      adminName: `Admin ${suffix}`,
    });
    await joined;
  }
});

function waitFor<T = unknown>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${event}"`));
    }, 2000);

    socket.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}
