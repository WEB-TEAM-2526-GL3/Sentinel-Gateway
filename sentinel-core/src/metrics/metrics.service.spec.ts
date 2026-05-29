import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';

import { MetricsService } from './metrics.service';
import { PrometheusService } from './prometheus.service';

type PrometheusMetrics = {
  totalRequests: number;
  requestsPerSecond: number;
  statusCodes: Record<string, number>;
  latency: { p50: number | null; p95: number | null; p99: number | null };
};

type MetricsServiceInternals = MetricsService & {
  pollAll(): Promise<void>;
};

describe('MetricsService', () => {
  const defaultMetrics: PrometheusMetrics = {
    totalRequests: 1,
    requestsPerSecond: 0.1,
    statusCodes: {
      200: 1,
    },
    latency: {
      p50: 1,
      p95: 2,
      p99: 3,
    },
  };

  const prometheusMock = {
    queryGatewayMetrics: jest.fn(),
  };

  const eventEmitterMock = {
    emit: jest.fn(),
  };

  let setIntervalSpy: ReturnType<typeof jest.spyOn>;
  let clearIntervalSpy: ReturnType<typeof jest.spyOn>;
  let service: MetricsServiceInternals;

  beforeEach(async () => {
    jest.clearAllMocks();
    (prometheusMock.queryGatewayMetrics as jest.Mock).mockResolvedValue(
      defaultMetrics,
    );

    setIntervalSpy = jest
      .spyOn(globalThis, 'setInterval')
      .mockReturnValue(0 as unknown as NodeJS.Timeout);
    clearIntervalSpy = jest
      .spyOn(globalThis, 'clearInterval')
      .mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: PrometheusService,
          useValue: prometheusMock,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitterMock,
        },
      ],
    }).compile();

    service = moduleRef.get(MetricsService) as MetricsServiceInternals;

    await new Promise((resolve) => setImmediate(resolve));
    jest.clearAllMocks();
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('logs emitted outputs for a successful poll', async () => {
    const metrics: PrometheusMetrics = {
      totalRequests: 50,
      requestsPerSecond: 2.5,
      statusCodes: {
        200: 50,
      },
      latency: {
        p50: 12,
        p95: 18,
        p99: 24,
      },
    };

    (prometheusMock.queryGatewayMetrics as jest.Mock).mockResolvedValue(
      metrics,
    );

    service.setScopes([{ consumerId: 'consumer-a', serviceId: 'service-a' }]);

    await service.pollAll();

    console.log(
      'metrics.updated events',
      JSON.stringify(
        (eventEmitterMock.emit as jest.Mock).mock.calls.filter(
          ([eventName]) => eventName === 'metrics.updated',
        ),
        null,
        2,
      ),
    );
    console.log(
      'health.changed events',
      JSON.stringify(
        (eventEmitterMock.emit as jest.Mock).mock.calls.filter(
          ([eventName]) => eventName === 'health.changed',
        ),
        null,
        2,
      ),
    );
    console.log(
      'latest metrics',
      JSON.stringify(
        service.getLatest({
          consumerId: 'consumer-a',
          serviceId: 'service-a',
        }),
        null,
        2,
      ),
    );
    console.log('current health', service.getServiceHealth('service-a'));

    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'metrics.updated',
      expect.objectContaining({
        consumerId: 'consumer-a',
        serviceId: 'service-a',
        metrics,
      }),
    );
    expect(
      service.getLatest({ consumerId: 'consumer-a', serviceId: 'service-a' }),
    ).toEqual(metrics);
    expect(service.getServiceHealth('service-a')).toBe(true);
  });

  it('logs emitted outputs for a failed poll', async () => {
    (prometheusMock.queryGatewayMetrics as jest.Mock).mockRejectedValue(
      new Error('Prometheus unavailable'),
    );

    service.setScopes([{ consumerId: 'consumer-b', serviceId: 'service-b' }]);

    await service.pollAll();

    console.log(
      'metrics.poll.failed events',
      JSON.stringify(
        (eventEmitterMock.emit as jest.Mock).mock.calls.filter(
          ([eventName]) => eventName === 'metrics.poll.failed',
        ),
        null,
        2,
      ),
    );

    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      'metrics.poll.failed',
      expect.objectContaining({
        consumerId: 'consumer-b',
        serviceId: 'service-b',
        source: 'prometheus',
        error: 'Prometheus unavailable',
      }),
    );
  });
});
