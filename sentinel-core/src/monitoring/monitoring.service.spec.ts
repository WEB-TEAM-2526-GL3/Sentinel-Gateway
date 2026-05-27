import { HttpService } from '@nestjs/axios';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of } from 'rxjs';
import { CreateMonitoringRuleDto } from './dto/create-monitoring-rule.dto';
import {
  MonitoringRuleEntity,
  MonitoringRuleType,
} from './entities/monitoring-rule.entity';
import { IncidentSeverity } from './enums/incident-severity.enum';
import { THRESHOLD_EXCEEDED_EVENT } from './events/threshold-exceeded.event';
import { MonitoringService } from './monitoring.service';

const repoMock = () => ({
  findOneBy: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
});

describe('MonitoringService', () => {
  let service: MonitoringService;
  let rulesRepo: ReturnType<typeof repoMock>;
  let httpService: { get: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    jest.spyOn(global, 'setInterval').mockReturnValue(undefined as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: getRepositoryToken(MonitoringRuleEntity), useFactory: repoMock },
        { provide: HttpService, useValue: { get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(MonitoringService);
    rulesRepo = module.get(getRepositoryToken(MonitoringRuleEntity));
    httpService = module.get(HttpService);
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createRule ──────────────────────────────────────────────────

  describe('createRule', () => {
    const dto: CreateMonitoringRuleDto = {
      name: 'openai-errors',
      serviceName: 'openai-svc',
      type: MonitoringRuleType.ERROR_RATE,
      errorRateThreshold: 0.1,
    };

    it('creates and returns a new rule when the name is unique', async () => {
      rulesRepo.findOneBy.mockResolvedValue(null);
      rulesRepo.create.mockReturnValue({ id: 'r1', ...dto });
      rulesRepo.save.mockResolvedValue({ id: 'r1', ...dto });

      const result = await service.createRule(dto);

      expect(rulesRepo.findOneBy).toHaveBeenCalledWith({ name: dto.name });
      expect(result.id).toBe('r1');
    });

    it('throws ConflictException when a rule with that name already exists', async () => {
      rulesRepo.findOneBy.mockResolvedValue({ id: 'existing' });

      await expect(service.createRule(dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ─── findRule ────────────────────────────────────────────────────

  describe('findRule', () => {
    it('returns the rule when found', async () => {
      const rule = { id: 'r1' } as MonitoringRuleEntity;
      rulesRepo.findOneBy.mockResolvedValue(rule);

      await expect(service.findRule('r1')).resolves.toEqual(rule);
    });

    it('throws NotFoundException when the rule is missing', async () => {
      rulesRepo.findOneBy.mockResolvedValue(null);

      await expect(service.findRule('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── deleteRule ──────────────────────────────────────────────────

  describe('deleteRule', () => {
    it('removes the rule from the repository', async () => {
      const rule = { id: 'r1' } as MonitoringRuleEntity;
      rulesRepo.findOneBy.mockResolvedValue(rule);
      rulesRepo.remove.mockResolvedValue(rule);

      await service.deleteRule('r1');

      expect(rulesRepo.remove).toHaveBeenCalledWith(rule);
    });
  });

  // ─── getLastReport ───────────────────────────────────────────────

  describe('getLastReport', () => {
    it('returns null before any check has run', () => {
      expect(service.getLastReport()).toBeNull();
    });
  });

  // ─── runScheduledCheck ───────────────────────────────────────────

  describe('runScheduledCheck', () => {
    it('returns an empty report when there are no active rules', async () => {
      rulesRepo.find.mockResolvedValue([]);

      const report = await service.runScheduledCheck();

      expect(report.totalRules).toBe(0);
      expect(report.triggeredRules).toBe(0);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does NOT emit an event when error rate is below threshold', async () => {
      rulesRepo.find.mockResolvedValue([buildRule({ errorRateThreshold: 0.1 })]);
      httpService.get.mockReturnValue(of({ data: prometheusOk('0.05') }));

      const report = await service.runScheduledCheck();

      expect(report.triggeredRules).toBe(0);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('emits monitoring.threshold.exceeded when error rate exceeds threshold', async () => {
      rulesRepo.find.mockResolvedValue([
        buildRule({ errorRateThreshold: 0.1, lastTriggeredAt: null }),
      ]);
      rulesRepo.save.mockResolvedValue({});
      httpService.get.mockReturnValue(of({ data: prometheusOk('0.25') }));

      const report = await service.runScheduledCheck();

      expect(report.triggeredRules).toBe(1);
      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        THRESHOLD_EXCEEDED_EVENT,
        expect.objectContaining({
          ruleName: 'openai-errors',
          serviceName: 'openai-svc',
          type: MonitoringRuleType.ERROR_RATE,
        }),
      );
    });

    it('persists lastTriggeredAt after firing so cooldown takes effect', async () => {
      const rule = buildRule({ errorRateThreshold: 0.1, lastTriggeredAt: null });
      rulesRepo.find.mockResolvedValue([rule]);
      rulesRepo.save.mockResolvedValue(rule);
      httpService.get.mockReturnValue(of({ data: prometheusOk('0.25') }));

      await service.runScheduledCheck();

      expect(rulesRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastTriggeredAt: expect.any(Date) }),
      );
    });
  });

  // ─── Cooldown logic ──────────────────────────────────────────────

  describe('cooldown', () => {
    it('skips event emission when the rule is still within its cooldown window', async () => {
      const rule = buildRule({ lastTriggeredAt: new Date(), cooldownMinutes: 15 });
      rulesRepo.find.mockResolvedValue([rule]);
      httpService.get.mockReturnValue(of({ data: prometheusOk('0.5') }));

      await service.runScheduledCheck();

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('emits a new event once the cooldown has expired', async () => {
      const sixteenMinutesAgo = new Date(Date.now() - 16 * 60 * 1000);
      const rule = buildRule({
        lastTriggeredAt: sixteenMinutesAgo,
        cooldownMinutes: 15,
      });
      rulesRepo.find.mockResolvedValue([rule]);
      rulesRepo.save.mockResolvedValue(rule);
      httpService.get.mockReturnValue(of({ data: prometheusOk('0.5') }));

      await service.runScheduledCheck();

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    });
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────

function buildRule(overrides: Partial<MonitoringRuleEntity> = {}): MonitoringRuleEntity {
  return {
    id: 'rule-1',
    name: 'openai-errors',
    serviceName: 'openai-svc',
    providerId: null,
    type: MonitoringRuleType.ERROR_RATE,
    errorRateThreshold: 0.1,
    latencyThresholdMs: null,
    metricWindow: '5m',
    cooldownMinutes: 15,
    severity: IncidentSeverity.HIGH,
    isActive: true,
    lastTriggeredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as MonitoringRuleEntity;
}

function prometheusOk(value: string) {
  return {
    status: 'success',
    data: { result: [{ metric: {}, value: [Date.now() / 1000, value] }] },
  };
}
