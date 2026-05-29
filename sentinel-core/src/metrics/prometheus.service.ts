import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import type { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import type { GatewayMetrics, MetricsScope } from './types/metrics.types.js';

@Injectable()
export class PrometheusService {
  private readonly logger = new Logger(PrometheusService.name);
  private readonly baseUrl =
    process.env.PROMETHEUS_URL || 'http://localhost:9090';

  constructor(private readonly http: HttpService) {}

  async queryGatewayMetrics(
    filter: MetricsScope,
    range = '5m',
  ): Promise<GatewayMetrics> {
    console.log('[PrometheusService] queryGatewayMetrics', { filter, range });
    const labels = this.buildServiceLabels(filter);

    const [totalRequests, requestsPerSecond, statusCodes, p50, p95, p99] =
      await Promise.all([
        this.querySingle(
          `sum(increase(kong_http_requests_total${labels}[${range}]))`,
        ),
        this.querySingle(
          `sum(rate(kong_http_requests_total${labels}[${range}]))`,
        ),
        this.queryStatusCodeBreakdown(labels, range),
        this.queryOptionalSingle(
          `histogram_quantile(0.5, sum(rate(kong_upstream_latency_ms_bucket${labels}[${range}])) by (le))`,
        ),
        this.queryOptionalSingle(
          `histogram_quantile(0.95, sum(rate(kong_upstream_latency_ms_bucket${labels}[${range}])) by (le))`,
        ),
        this.queryOptionalSingle(
          `histogram_quantile(0.99, sum(rate(kong_upstream_latency_ms_bucket${labels}[${range}])) by (le))`,
        ),
      ]);

    const metrics = {
      totalRequests,
      requestsPerSecond,
      statusCodes,
      latency: { p50, p95, p99 },
    };

    console.log('[PrometheusService] queryGatewayMetrics result', metrics);

    return metrics;
  }

  async queryScalar(query: string): Promise<number> {
    return this.querySingle(query);
  }

  async queryRange(
    query: string,
    start: string,
    end: string,
    step: string,
  ): Promise<PrometheusResponse> {
    console.log('[PrometheusService] queryRange', { query, start, end, step });
    const response: AxiosResponse<PrometheusResponse> = await firstValueFrom(
      this.http.get(`${this.baseUrl}/api/v1/query_range`, {
        params: { query, start, end, step },
      }),
    );

    console.log('[PrometheusService] queryRange result', response.data);

    return response.data;
  }

  private buildServiceLabels(filter: MetricsScope): string {
    if (filter.consumerId && filter.serviceId) {
      return `{service="${filter.consumerId}-${filter.serviceId}-svc"}`;
    }
    if (filter.consumerId) {
      return `{service=~"${filter.consumerId}-.*"}`;
    }
    if (filter.serviceId) {
      return `{service=~".*-${filter.serviceId}-svc"}`;
    }
    return '';
  }

  private async querySingle(query: string): Promise<number> {
    return (await this.queryOptionalSingle(query)) ?? 0;
  }

  private async queryOptionalSingle(query: string): Promise<number | null> {
    try {
      console.log('[PrometheusService] querySingle', query);
      const { data } = await firstValueFrom(
        this.http.get<PrometheusResponse>(`${this.baseUrl}/api/v1/query`, {
          params: { query },
        }),
      );
      if (data.status === 'success' && data.data.result.length > 0) {
        const rawValue = data.data.result[0].value?.[1];
        const value = this.parseFiniteNumber(rawValue);
        console.log('[PrometheusService] querySingle result', {
          query,
          rawValue,
          value,
        });
        return value;
      }

      console.log('[PrometheusService] querySingle result', {
        query,
        value: null,
      });
      return null;
    } catch (err) {
      this.logger.error(`Prometheus query failed: ${query}`, err);
      return null;
    }
  }

  private async queryStatusCodeBreakdown(
    labels: string,
    range: string,
  ): Promise<Record<string, number>> {
    const query = `sum by (code) (increase(kong_http_status${labels}[${range}]))`;
    try {
      console.log('[PrometheusService] queryStatusCodeBreakdown', {
        labels,
        range,
      });
      const { data } = await firstValueFrom(
        this.http.get<PrometheusResponse>(`${this.baseUrl}/api/v1/query`, {
          params: { query },
        }),
      );
      const result: Record<string, number> = {};
      if (data.status === 'success') {
        for (const item of data.data.result) {
          result[item.metric.code] = this.parseFiniteNumber(
            item.value?.[1],
          ) ?? 0;
        }
      }

      console.log('[PrometheusService] queryStatusCodeBreakdown result', {
        labels,
        range,
        result,
      });

      return result;
    } catch (err) {
      this.logger.error('Status code query failed', err);
      return {};
    }
  }

  private parseFiniteNumber(value: string | undefined): number | null {
    const parsed = Number(value ?? '0');
    return Number.isFinite(parsed) ? parsed : null;
  }
}

interface PrometheusResponse {
  status: 'success' | 'error';
  data: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value?: [number, string];
      values?: Array<[number, string]>;
    }>;
  };
}
