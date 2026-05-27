import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface MetricsFilter {
  clientId?: string;
  providerId?: string;
}

export interface KongMetrics {
  totalRequests: number;
  requestsPerSecond: number;
  statusCodes: Record<string, number>;
  latency: { p50: number; p95: number; p99: number };
}

export interface AiTokens {
  prompt: number;
  completion: number;
  total: number;
}

@Injectable()
export class PrometheusService {
  private readonly logger = new Logger(PrometheusService.name);
  private readonly baseUrl =
    process.env.PROMETHEUS_URL || 'http://localhost:9090';

  constructor(private readonly http: HttpService) {}

  /**
   * Fetch HTTP metrics for a given filter + time range.
   * Builds PromQL internally based on the naming convention:
   *   - Per client+provider:  service name = "{client}-{provider}-svc"
   *   - Per provider (global): service name = "{provider}-svc"
   *   - Per client (global):   service regex  = "{client}-.*"
   *   - Global:                no filter
   */
  async queryMetrics(
    filter: MetricsFilter,
    range = '5m',
  ): Promise<KongMetrics> {
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
        this.querySingle(
          `histogram_quantile(0.5, sum(rate(kong_upstream_latency_ms_bucket${labels}[${range}])) by (le))`,
        ),
        this.querySingle(
          `histogram_quantile(0.95, sum(rate(kong_upstream_latency_ms_bucket${labels}[${range}])) by (le))`,
        ),
        this.querySingle(
          `histogram_quantile(0.99, sum(rate(kong_upstream_latency_ms_bucket${labels}[${range}])) by (le))`,
        ),
      ]);

    return {
      totalRequests,
      requestsPerSecond,
      statusCodes,
      latency: { p50, p95, p99 },
    };
  }

  /**
   * Fetch AI token counters for a provider+model.
   * Labels: ai_provider="{name}", ai_model="{model}"
   * Uses the naming convention: providerId = "openai:gpt-4o" (name:model).
   */
  async queryAiTokens(
    providerId: string,
    modelName: string,
    range = '5m',
  ): Promise<AiTokens> {
    const labels = `{ai_provider="${providerId}",ai_model="${modelName}"}`;
    const [prompt, completion, total] = await Promise.all([
      this.querySingle(
        `sum(increase(kong_ai_llm_tokens_total${labels}{token_type="prompt_tokens"}[${range}]))`,
      ),
      this.querySingle(
        `sum(increase(kong_ai_llm_tokens_total${labels}{token_type="completion_tokens"}[${range}]))`,
      ),
      this.querySingle(
        `sum(increase(kong_ai_llm_tokens_total${labels}{token_type="total_tokens"}[${range}]))`,
      ),
    ]);

    return { prompt, completion, total };
  }

  /**
   * Execute a range query (for historical charts).
   * Returns raw Prometheus matrix.
   */
  async queryRange(
    query: string,
    start: string,
    end: string,
    step: string,
  ): Promise<any> {
    const { data } = await firstValueFrom(
      this.http.get(`${this.baseUrl}/api/v1/query_range`, {
        params: { query, start, end, step },
      }),
    );
    return data;
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private buildServiceLabels(filter: MetricsFilter): string {
    if (filter.clientId && filter.providerId) {
      // Specific client-provider pair
      return `{service="${filter.clientId}-${filter.providerId}-svc"}`;
    }
    if (filter.clientId) {
      // All services for this client
      return `{service=~"${filter.clientId}-.*"}`;
    }
    if (filter.providerId) {
      // All services for this provider (across clients)
      return `{service=~".*-${filter.providerId}-svc"}`;
    }
    // Global — no filter
    return '';
  }

  private async querySingle(query: string): Promise<number> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<PrometheusResponse>(`${this.baseUrl}/api/v1/query`, {
          params: { query },
        }),
      );
      if (data.status === 'success' && data.data.result.length > 0) {
        return parseFloat(data.data.result[0].value?.[1] ?? '0');
      }
      return 0;
    } catch (err) {
      this.logger.error(`Prometheus query failed: ${query}`, err);
      return 0;
    }
  }

  private async queryStatusCodeBreakdown(
    labels: string,
    range: string,
  ): Promise<Record<string, number>> {
    const query = `sum by (code) (increase(kong_http_status${labels}[${range}]))`;
    try {
      const { data } = await firstValueFrom(
        this.http.get<PrometheusResponse>(`${this.baseUrl}/api/v1/query`, {
          params: { query },
        }),
      );
      const result: Record<string, number> = {};
      if (data.status === 'success') {
        for (const item of data.data.result) {
          result[item.metric.code] = parseFloat(item.value?.[1] ?? '0');
        }
      }
      return result;
    } catch (err) {
      this.logger.error(`Status code query failed`, err);
      return {};
    }
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
