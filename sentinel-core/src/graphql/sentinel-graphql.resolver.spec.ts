import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { Test } from '@nestjs/testing';
import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';

jest.mock('../gateway/gateway.service', () => ({
  GatewayService: class GatewayService {},
}));

import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CeoSecretService } from '../auth/ceo-secret.service';
import type { GatewayService } from '../gateway/gateway.service';
import { IncidentsService } from '../incidents/incidents.service';
import type { IncidentSnapshot } from '../incidents/incidents.service';
import { IncidentLogAction } from '../incidents/enum/incident-log-action.enum';
import { IncidentSeverity } from '../incidents/enum/incident-severity.enum';
import { IncidentStatus } from '../incidents/enum/incident-status.enum';
import { MessengerWebhookService } from '../messenger/messenger-webhook.service';
import { MetricsService } from '../metrics/metrics.service';
import { MonitoringRuleType } from '../monitoring/entities/monitoring-rule.entity';
import type { MonitoringRuleEntity } from '../monitoring/entities/monitoring-rule.entity';
import { MonitoringService } from '../monitoring/monitoring.service';
import { UserRole } from '../users/enum/user-role.enum';
import { UserStatus } from '../users/enum/user-status.enum';
import type { UserEntity } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { WebhookDeliveryStatus } from '../webhooks/types/webhook-delivery-status.enum';
import { WebhookEventType } from '../webhooks/types/webhook-event-type.enum';
import { WebhookProvider } from '../webhooks/types/webhook-provider.enum';
import { WebhooksService } from '../webhooks/webhooks.service';
import { SentinelGraphqlResolver } from './sentinel-graphql.resolver';

type MockedServices = {
  authService: {
    register: jest.MockedFunction<AuthService['register']>;
    login: jest.MockedFunction<AuthService['login']>;
    logout: jest.MockedFunction<AuthService['logout']>;
  };
  ceoSecretService: {
    validateOrThrow: jest.MockedFunction<CeoSecretService['validateOrThrow']>;
  };
  usersService: {
    findAll: jest.MockedFunction<UsersService['findAll']>;
    deactivateUser: jest.MockedFunction<UsersService['deactivateUser']>;
  };
  gatewayService: {
    listServices: jest.MockedFunction<GatewayService['listServices']>;
    createService: jest.MockedFunction<GatewayService['createService']>;
  };
  incidentsService: {
    listIncidents: jest.MockedFunction<IncidentsService['listIncidents']>;
    getIncidentSnapshot: jest.MockedFunction<
      IncidentsService['getIncidentSnapshot']
    >;
  };
  monitoringService: {
    getLastReport: jest.MockedFunction<MonitoringService['getLastReport']>;
    createRule: jest.MockedFunction<MonitoringService['createRule']>;
  };
  metricsService: {
    queryGatewayMetrics: jest.MockedFunction<
      MetricsService['queryGatewayMetrics']
    >;
  };
  webhooksService: {
    emit: jest.MockedFunction<WebhooksService['emit']>;
  };
  messengerService: {
    listEvents: jest.MockedFunction<MessengerWebhookService['listEvents']>;
  };
};

describe('SentinelGraphqlResolver', () => {
  let resolver: SentinelGraphqlResolver;
  let services: MockedServices;

  beforeEach(() => {
    services = createServices();
    resolver = new SentinelGraphqlResolver(
      services.authService as unknown as AuthService,
      services.ceoSecretService as unknown as CeoSecretService,
      services.usersService as unknown as UsersService,
      services.gatewayService as unknown as GatewayService,
      services.incidentsService as unknown as IncidentsService,
      services.monitoringService as unknown as MonitoringService,
      services.metricsService as unknown as MetricsService,
      services.webhooksService as unknown as WebhooksService,
      services.messengerService as unknown as MessengerWebhookService,
    );
  });

  it('returns health and delegates randomized auth inputs', async () => {
    const email = `${randomSlug()}@sentinel.test`;
    const fullName = `Admin ${randomSlug()}`;
    const password = randomSlug();
    const ceoSecret = randomSlug();
    const user = userEntity({ email, fullName });

    services.authService.register.mockResolvedValueOnce({
      accessToken: randomSlug(),
      tokenType: 'Bearer',
      expiresIn: '100h',
      user,
    });

    expect(resolver.graphqlHealth()).toBe('Sentinel GraphQL is ready');

    const result = await resolver.register({
      email,
      fullName,
      password,
      ceoSecret,
    });

    expect(services.authService.register).toHaveBeenCalledWith({
      email,
      fullName,
      password,
      ceoSecret,
    });
    expect(result.user.email).toBe(email);
    expect(result.user.fullName).toBe(fullName);
  });

  it('generates the GraphQL schema without undefined field types', async () => {
    const gatewayModuleMock = jest.requireMock('../gateway/gateway.service') as {
      GatewayService: new () => unknown;
    };

    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
      providers: [
        SentinelGraphqlResolver,
        { provide: AuthService, useValue: services.authService },
        { provide: CeoSecretService, useValue: services.ceoSecretService },
        { provide: UsersService, useValue: services.usersService },
        { provide: gatewayModuleMock.GatewayService, useValue: services.gatewayService },
        { provide: IncidentsService, useValue: services.incidentsService },
        { provide: MonitoringService, useValue: services.monitoringService },
        { provide: MetricsService, useValue: services.metricsService },
        { provide: WebhooksService, useValue: services.webhooksService },
        {
          provide: MessengerWebhookService,
          useValue: services.messengerService,
        },
      ],
    }).compile();

    const schemaFactory = moduleRef.get(GraphQLSchemaFactory);
    const schema = await schemaFactory.create([SentinelGraphqlResolver]);

    expect(schema.getType('MonitoringRule')).toBeDefined();
    expect(schema.getQueryType()?.getFields().graphqlHealth).toBeDefined();
  });

  it('builds a dashboard overview from existing services', async () => {
    const currentUser = authenticatedUser();
    const incident = incidentEntity();
    const serviceName = `svc-${randomSlug()}`;

    services.incidentsService.listIncidents.mockResolvedValueOnce([incident]);
    services.gatewayService.listServices.mockResolvedValueOnce([
      {
        id: randomId(),
        name: serviceName,
        url: 'https://example.test/api',
      },
    ]);
    services.monitoringService.getLastReport.mockReturnValueOnce({
      checkedAt: new Date(),
      totalRules: 2,
      activeRules: 2,
      triggeredRules: 1,
      results: [
        {
          ruleId: randomId(),
          ruleName: randomSlug(),
          serviceName,
          type: MonitoringRuleType.ERROR_RATE,
          triggered: true,
          currentValue: 0.7,
          threshold: 0.5,
          reason: 'Too many errors',
          checkedAt: new Date(),
        },
      ],
    });

    const overview = await resolver.dashboardOverview({
      req: { user: currentUser },
    } as never);

    expect(services.incidentsService.listIncidents).toHaveBeenCalledWith(
      IncidentStatus.OPEN,
    );
    expect(overview.me.id).toBe(currentUser.id);
    expect(overview.openIncidents).toHaveLength(1);
    expect(overview.gatewayServices[0].name).toBe(serviceName);
    expect(overview.monitoringStatus?.triggeredRules).toBe(1);
  });

  it('validates incident snapshots and JSON log mapping', async () => {
    const incident = incidentEntity();
    const details = { message: `Update ${randomSlug()}` };
    const snapshot: IncidentSnapshot = {
      incident,
      logs: [
        {
          id: Math.floor(Math.random() * 1000),
          incidentId: incident.id,
          adminId: randomId(),
          adminName: randomSlug(),
          action: IncidentLogAction.MESSAGE,
          details,
          createdAt: new Date(),
          incident,
        },
      ],
    };

    services.incidentsService.getIncidentSnapshot.mockResolvedValueOnce(
      snapshot,
    );

    const result = await resolver.incident(incident.id);

    expect(services.incidentsService.getIncidentSnapshot).toHaveBeenCalledWith(
      incident.id,
    );
    expect(result.incident.id).toBe(incident.id);
    expect(JSON.parse(result.logs[0].detailsJson)).toEqual(details);
  });

  it('creates gateway and monitoring records through facade inputs', async () => {
    const serviceInput = {
      name: `svc-${randomSlug()}`,
      url: 'https://example.test',
      route: {
        paths: [`/${randomSlug()}`],
        stripPath: true,
      },
    };
    const monitoringInput = {
      name: `rule-${randomSlug()}`,
      serviceName: serviceInput.name,
      type: MonitoringRuleType.LATENCY_P95,
      latencyThresholdMs: 500,
      severity: IncidentSeverity.HIGH,
    };

    services.gatewayService.createService.mockResolvedValueOnce({
      id: randomId(),
      name: serviceInput.name,
      url: serviceInput.url,
    });
    services.monitoringService.createRule.mockResolvedValueOnce(
      monitoringRule({
        name: monitoringInput.name,
        serviceName: monitoringInput.serviceName,
        type: monitoringInput.type,
        latencyThresholdMs: monitoringInput.latencyThresholdMs,
        severity: monitoringInput.severity,
      }),
    );

    const service = await resolver.createGatewayService(serviceInput);
    const rule = await resolver.createMonitoringRule(monitoringInput);

    expect(services.gatewayService.createService).toHaveBeenCalledWith(
      serviceInput,
    );
    expect(service.name).toBe(serviceInput.name);
    expect(services.monitoringService.createRule).toHaveBeenCalledWith(
      monitoringInput,
    );
    expect(rule.latencyThresholdMs).toBe(500);
  });

  it('validates metrics and webhook JSON facade mapping', async () => {
    const payload = { incidentId: randomId(), reason: randomSlug() };

    services.metricsService.queryGatewayMetrics.mockResolvedValueOnce({
      totalRequests: 12,
      requestsPerSecond: 1.2,
      statusCodes: { '200': 10, '500': 2 },
      latency: { p50: 10, p95: 20, p99: 30 },
    });
    services.webhooksService.emit.mockResolvedValueOnce({
      eventType: WebhookEventType.INCIDENT_CREATED,
      matchedWebhooks: 1,
      deliveries: [
        {
          id: randomId(),
          webhookId: randomId(),
          status: WebhookDeliveryStatus.SUCCESS,
          attemptCount: 1,
        },
      ],
    });

    const metrics = await resolver.gatewayMetrics(
      { serviceId: randomId() },
      '5m',
    );
    const emitted = await resolver.emitWebhookEvent({
      eventType: WebhookEventType.INCIDENT_CREATED,
      source: 'Jest',
      payloadJson: JSON.stringify(payload),
    });

    expect(metrics.statusCodes).toEqual([
      { code: '200', count: 10 },
      { code: '500', count: 2 },
    ]);
    expect(services.webhooksService.emit).toHaveBeenCalledWith({
      eventType: WebhookEventType.INCIDENT_CREATED,
      source: 'Jest',
      payload,
    });
    expect(emitted.deliveries[0].status).toBe(WebhookDeliveryStatus.SUCCESS);
  });

  it('sanitizes non-finite metric values for GraphQL floats', async () => {
    services.metricsService.queryGatewayMetrics.mockResolvedValueOnce({
      totalRequests: Number.NaN,
      requestsPerSecond: Number.POSITIVE_INFINITY,
      statusCodes: { '200': Number.NaN },
      latency: {
        p50: Number.NaN,
        p95: Number.POSITIVE_INFINITY,
        p99: 0,
      },
    });

    const metrics = await resolver.gatewayMetrics(undefined, '5m');

    expect(metrics.totalRequests).toBe(0);
    expect(metrics.requestsPerSecond).toBe(0);
    expect(metrics.statusCodes).toEqual([{ code: '200', count: 0 }]);
    expect(metrics.latency).toEqual({ p50: null, p95: null, p99: 0 });
  });

  it('rejects non-object webhook JSON payloads', async () => {
    await expect(
      resolver.emitWebhookEvent({
        eventType: WebhookEventType.ADMIN_ACTION,
        payloadJson: JSON.stringify(['not', 'an', 'object']),
      }),
    ).rejects.toThrow('Expected a JSON object');
  });
});

function createServices(): MockedServices {
  return {
    authService: {
      register: jest.fn<AuthService['register']>(),
      login: jest.fn<AuthService['login']>(),
      logout: jest.fn<AuthService['logout']>(() => ({
        message: 'Logged out',
      })),
    },
    ceoSecretService: {
      validateOrThrow: jest.fn<CeoSecretService['validateOrThrow']>(),
    },
    usersService: {
      findAll: jest.fn<UsersService['findAll']>(),
      deactivateUser: jest.fn<UsersService['deactivateUser']>(),
    },
    gatewayService: {
      listServices: jest.fn<GatewayService['listServices']>(),
      createService: jest.fn<GatewayService['createService']>(),
    },
    incidentsService: {
      listIncidents: jest.fn<IncidentsService['listIncidents']>(),
      getIncidentSnapshot:
        jest.fn<IncidentsService['getIncidentSnapshot']>(),
    },
    monitoringService: {
      getLastReport: jest.fn<MonitoringService['getLastReport']>(),
      createRule: jest.fn<MonitoringService['createRule']>(),
    },
    metricsService: {
      queryGatewayMetrics: jest.fn<MetricsService['queryGatewayMetrics']>(),
    },
    webhooksService: {
      emit: jest.fn<WebhooksService['emit']>(),
    },
    messengerService: {
      listEvents: jest.fn<MessengerWebhookService['listEvents']>(),
    },
  };
}

function userEntity(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: randomId(),
    email: `${randomSlug()}@sentinel.test`,
    fullName: `Admin ${randomSlug()}`,
    passwordHash: randomSlug(),
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function authenticatedUser(): AuthenticatedUser {
  const user = userEntity();
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

function incidentEntity(overrides: Partial<IncidentSnapshot['incident']> = {}) {
  const now = new Date();
  return {
    id: randomId(),
    serviceId: randomId(),
    providerId: randomId(),
    severity: IncidentSeverity.HIGH,
    reason: `Incident ${randomSlug()}`,
    status: IncidentStatus.OPEN,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    logs: [],
    ...overrides,
  };
}

function monitoringRule(
  overrides: Partial<MonitoringRuleEntity> = {},
): MonitoringRuleEntity {
  const now = new Date();
  return {
    id: randomId(),
    name: `rule-${randomSlug()}`,
    serviceName: `svc-${randomSlug()}`,
    providerId: null,
    type: MonitoringRuleType.ERROR_RATE,
    errorRateThreshold: 0.2,
    latencyThresholdMs: null,
    metricWindow: '5m',
    cooldownMinutes: 15,
    isActive: true,
    severity: IncidentSeverity.MEDIUM,
    lastTriggeredAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function randomId(): string {
  const segment = () =>
    Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, '0');
  return `${segment()}${segment()}-${segment()}-4${segment().slice(
    1,
  )}-8${segment().slice(1)}-${segment()}${segment()}${segment()}`;
}

function randomSlug(): string {
  return Math.random().toString(36).slice(2, 10);
}
