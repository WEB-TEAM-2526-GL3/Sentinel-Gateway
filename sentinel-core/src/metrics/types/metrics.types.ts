export interface MetricsScope {
  consumerId?: string;
  serviceId?: string;
}

export interface GatewayMetrics {
  totalRequests: number;
  requestsPerSecond: number;
  statusCodes: Record<string, number>;
  latency: { p50: number | null; p95: number | null; p99: number | null };
}
