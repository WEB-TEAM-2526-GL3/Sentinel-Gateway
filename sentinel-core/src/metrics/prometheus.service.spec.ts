import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';

import { PrometheusService } from './prometheus.service';

describe('PrometheusService', () => {
  const httpMock = {
    get: jest.fn(),
  } as unknown as HttpService;

  let service: PrometheusService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrometheusService,
        {
          provide: HttpService,
          useValue: httpMock,
        },
      ],
    }).compile();

    service = moduleRef.get(PrometheusService);
  });

  it('logs gateway metrics output', async () => {
    (httpMock.get as jest.Mock).mockImplementation(
      (url: unknown, options: unknown) => {
        const resolvedUrl = String(url);
        const params =
          typeof options === 'object' && options !== null
            ? (options as { params?: { query?: string } })
            : undefined;
        const query = String(params?.params?.query ?? '');

        if (query.includes('kong_http_status')) {
          return of({
            data: {
              status: 'success',
              data: {
                resultType: 'vector',
                result: [
                  { metric: { code: '200' }, value: [0, '12'] },
                  { metric: { code: '500' }, value: [0, '3'] },
                ],
              },
            },
          });
        }

        if (query.includes('kong_http_requests_total')) {
          return of({
            data: {
              status: 'success',
              data: {
                resultType: 'vector',
                result: [{ metric: {}, value: [0, '42'] }],
              },
            },
          });
        }

        if (query.includes('kong_upstream_latency_ms_bucket')) {
          return of({
            data: {
              status: 'success',
              data: {
                resultType: 'vector',
                result: [{ metric: {}, value: [0, '18.5'] }],
              },
            },
          });
        }

        console.log('unexpected prometheus request', {
          url: resolvedUrl,
          query,
        });
        return of({
          data: {
            status: 'success',
            data: {
              resultType: 'vector',
              result: [],
            },
          },
        });
      },
    );

    const metrics = await service.queryGatewayMetrics(
      { consumerId: 'consumer-a', serviceId: 'service-a' },
      '5m',
    );

    console.log('gateway metrics output', JSON.stringify(metrics, null, 2));

    expect(metrics.totalRequests).toBe(42);
    expect(metrics.statusCodes).toEqual({ 200: 12, 500: 3 });
  });

  it('returns null latency percentiles when Prometheus returns NaN', async () => {
    (httpMock.get as jest.Mock).mockImplementation(
      (url: unknown, options: unknown) => {
        const resolvedUrl = String(url);
        const params =
          typeof options === 'object' && options !== null
            ? (options as { params?: { query?: string } })
            : undefined;
        const query = String(params?.params?.query ?? '');

        if (query.includes('kong_upstream_latency_ms_bucket')) {
          return of({
            data: {
              status: 'success',
              data: {
                resultType: 'vector',
                result: [{ metric: {}, value: [0, 'NaN'] }],
              },
            },
          });
        }

        console.log('unexpected prometheus request', {
          url: resolvedUrl,
          query,
        });
        return of({
          data: {
            status: 'success',
            data: {
              resultType: 'vector',
              result: [],
            },
          },
        });
      },
    );

    const metrics = await service.queryGatewayMetrics({}, '5m');

    expect(metrics.totalRequests).toBe(0);
    expect(metrics.requestsPerSecond).toBe(0);
    expect(metrics.statusCodes).toEqual({});
    expect(metrics.latency).toEqual({ p50: null, p95: null, p99: null });
  });

  it('logs query range output', async () => {
    (httpMock.get as jest.Mock).mockReturnValue(
      of({
        data: {
          status: 'success',
          data: {
            resultType: 'matrix',
            result: [
              {
                metric: { service: 'service-a' },
                values: [
                  [1710000000, '1'],
                  [1710000300, '3'],
                ],
              },
            ],
          },
        },
      }),
    );

    const result = await service.queryRange(
      'up',
      '1710000000',
      '1710000600',
      '30s',
    );

    console.log('prometheus range output', JSON.stringify(result, null, 2));

    expect(result.status).toBe('success');
    expect(result.data.result).toHaveLength(1);
  });
});
