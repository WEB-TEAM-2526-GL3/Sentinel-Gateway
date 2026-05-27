import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { KongAdapterService } from '../kong-adapter/kong-adapter.service';
import { IncidentLogAction } from './domain/incident-log-action.enum';
import { IncidentSeverity } from './domain/incident-severity.enum';
import { IncidentStatus } from './domain/incident-status.enum';
import { InMemoryIncidentsRepository } from './infrastructure/in-memory-incidents.repository';
import { INCIDENTS_REPOSITORY } from './incidents.constants';
import { IncidentsService } from './incidents.service';

const createInput = {
  serviceId: '22222222-2222-4222-8222-222222222222',
  providerId: '33333333-3333-4333-8333-333333333333',
  severity: IncidentSeverity.HIGH,
  reason: 'OpenAI timeout spike',
  adminId: 'admin-1',
  adminName: 'Admin One',
};

describe('IncidentsService', () => {
  let service: IncidentsService;
  let kongAdapter: { activateFallback: jest.Mock<Promise<void>, [unknown]> };

  beforeEach(async () => {
    kongAdapter = {
      activateFallback: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        InMemoryIncidentsRepository,
        {
          provide: INCIDENTS_REPOSITORY,
          useExisting: InMemoryIncidentsRepository,
        },
        {
          provide: KongAdapterService,
          useValue: kongAdapter,
        },
      ],
    }).compile();

    service = module.get(IncidentsService);
  });

  it('creates an incident and initial audit log', async () => {
    const result = await service.createIncident(createInput);

    expect(result.incident.status).toBe(IncidentStatus.OPEN);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].action).toBe(IncidentLogAction.CREATED);
  });

  it('appends chat messages', async () => {
    const { incident } = await service.createIncident(createInput);
    const log = await service.sendMessage({
      incidentId: incident.id,
      adminId: 'admin-1',
      adminName: 'Admin One',
      message: 'Investigating now',
    });

    expect(log.action).toBe(IncidentLogAction.MESSAGE);
    expect(log.details).toEqual({ message: 'Investigating now' });
  });

  it('acknowledges, resolves, and logs actions', async () => {
    const { incident } = await service.createIncident(createInput);
    const acknowledged = await service.acknowledge({
      incidentId: incident.id,
      adminId: 'admin-1',
      adminName: 'Admin One',
      notes: 'Taking ownership',
    });
    const resolved = await service.resolve({
      incidentId: incident.id,
      adminId: 'admin-1',
      adminName: 'Admin One',
      notes: 'Traffic stable',
    });

    expect(acknowledged.incident.status).toBe(IncidentStatus.ACKNOWLEDGED);
    expect(resolved.incident.status).toBe(IncidentStatus.RESOLVED);
    expect(resolved.logs.map((log) => log.action)).toEqual([
      IncidentLogAction.CREATED,
      IncidentLogAction.ACKNOWLEDGED,
      IncidentLogAction.RESOLVED,
    ]);
  });

  it('activates fallback through Kong and logs the fallback', async () => {
    const { incident } = await service.createIncident(createInput);
    const result = await service.activateFallback({
      incidentId: incident.id,
      adminId: 'admin-1',
      adminName: 'Admin One',
      serviceName: 'openai-service',
      fallbackProviderId: '44444444-4444-4444-8444-444444444444',
      fallbackUrl: 'http://gemini.local',
    });

    expect(kongAdapter.activateFallback).toHaveBeenCalledWith({
      serviceName: 'openai-service',
      fallbackProviderId: '44444444-4444-4444-8444-444444444444',
      fallbackUrl: 'http://gemini.local',
    });
    expect(result.incident.fallbackProviderId).toBe(
      '44444444-4444-4444-8444-444444444444',
    );
    expect(result.logs.at(-1)?.action).toBe(
      IncidentLogAction.FALLBACK_ACTIVATED,
    );
  });

  it('throws clear errors for missing incidents and invalid transitions', async () => {
    await expect(service.getIncidentWithLogs('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const { incident } = await service.createIncident(createInput);
    await service.resolve({
      incidentId: incident.id,
      adminId: 'admin-1',
      adminName: 'Admin One',
    });

    await expect(
      service.activateFallback({
        incidentId: incident.id,
        adminId: 'admin-1',
        adminName: 'Admin One',
        serviceName: 'openai-service',
        fallbackProviderId: '44444444-4444-4444-8444-444444444444',
        fallbackUrl: 'http://gemini.local',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
