import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PrometheusService,
  KongMetrics,
  AiTokens,
  MetricsFilter,
} from './prometheus.service';
import { LinkRepository } from '../links/link.repository';
import { ProviderRepository } from '../providers/provider.repository';

interface CachedMetrics {
  metrics: KongMetrics;
  timestamp: Date;
}

interface CachedAiTokens {
  tokens: AiTokens;
  timestamp: Date;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private cache = new Map<string, CachedMetrics>(); // key: "clientId:providerId"
  private aiCache = new Map<string, CachedAiTokens>(); // key: "providerId:modelName"
  private history = new Map<string, KongMetrics[]>(); // ring buffer (last 20)

  constructor(
    private readonly prometheus: PrometheusService,
    private readonly linkRepo: LinkRepository,
    private readonly providerRepo: ProviderRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.startPolling();
  }

  // ─── Polling ──────────────────────────────────────────────────────

  private startPolling(): void {
    this.pollAll();
    setInterval(() => this.pollAll(), 15000);
  }

  private async pollAll(): Promise<void> {
    const filters = await this.buildActiveFilters();
    for (const filter of filters) {
      try {
        const metrics = await this.prometheus.queryMetrics(filter, '5m');
        const key = `${filter.clientId ?? 'global'}:${filter.providerId ?? 'global'}`;
        const prev = this.cache.get(key);

        this.cache.set(key, { metrics, timestamp: new Date() });
        this.addToHistory(key, metrics);

        if (!prev || this.hasMetricsChanged(prev.metrics, metrics)) {
          this.eventEmitter.emit('metrics.updated', {
            clientId: filter.clientId ?? 'global',
            providerId: filter.providerId ?? 'global',
            metrics,
            timestamp: new Date(),
          });
        }
      } catch (err) {
        this.logger.error(
          `Metrics poll failed for ${filter.clientId}:${filter.providerId}`,
          err,
        );
      }
    }

    // AI tokens per AI provider
    const aiPairs = await this.buildAIPairs();
    for (const { providerId, modelName } of aiPairs) {
      try {
        const tokens = await this.prometheus.queryAiTokens(
          providerId,
          modelName,
          '5m',
        );
        const key = `${providerId}:${modelName}`;
        const prev = this.aiCache.get(key);
        this.aiCache.set(key, { tokens, timestamp: new Date() });

        if (
          !prev ||
          prev.tokens.prompt !== tokens.prompt ||
          prev.tokens.completion !== tokens.completion
        ) {
          this.eventEmitter.emit('ai.tokens.updated', {
            providerId,
            modelName,
            ...tokens,
          });
        }
      } catch (err) {
        this.logger.error(
          `AI token poll failed for ${providerId}:${modelName}`,
          err,
        );
      }
    }
  }

  // ─── Public API ───────────────────────────────────────────────────

  getLatest(filter: MetricsFilter): KongMetrics | null {
    const key = `${filter.clientId ?? 'global'}:${filter.providerId ?? 'global'}`;
    return this.cache.get(key)?.metrics ?? null;
  }

  getAiTokens(providerId: string, modelName: string): AiTokens | null {
    return this.aiCache.get(`${providerId}:${modelName}`)?.tokens ?? null;
  }

  getRecentHistory(filter: MetricsFilter, count = 20): KongMetrics[] {
    const key = `${filter.clientId ?? 'global'}:${filter.providerId ?? 'global'}`;
    return (this.history.get(key) ?? []).slice(-count);
  }

  // ─── Private Helpers ──────────────────────────────────────────────

  private async buildActiveFilters(): Promise<MetricsFilter[]> {
    const filters: MetricsFilter[] = [
      { clientId: 'global', providerId: 'global' },
    ];

    const links = await this.linkRepo.findAllActive();
    const seen = new Set<string>();

    for (const link of links) {
      // Per-client
      const clientKey = `${link.clientId}:global`;
      if (!seen.has(clientKey)) {
        seen.add(clientKey);
        filters.push({ clientId: link.clientId, providerId: 'global' });
      }
      // Per-provider
      const providerKey = `global:${link.providerId}`;
      if (!seen.has(providerKey)) {
        seen.add(providerKey);
        filters.push({ clientId: 'global', providerId: link.providerId });
      }
      // Per-pair
      const pairKey = `${link.clientId}:${link.providerId}`;
      if (!seen.has(pairKey)) {
        seen.add(pairKey);
        filters.push({ clientId: link.clientId, providerId: link.providerId });
      }
    }

    return filters;
  }

  private async buildAIPairs(): Promise<
    { providerId: string; modelName: string }[]
  > {
    const providers = await this.providerRepo.findAllActive();
    return providers
      .filter((p) => p.kind === 'llm')
      .map((p) => ({
        providerId: (p as any).aiProvider?.aiProviderName,
        modelName: (p as any).aiProvider?.aiModelName,
      }));
  }

  private addToHistory(key: string, metrics: KongMetrics): void {
    const hist = this.history.get(key) ?? [];
    hist.push(metrics);
    if (hist.length > 20) hist.shift();
    this.history.set(key, hist);
  }

  private hasMetricsChanged(prev: KongMetrics, next: KongMetrics): boolean {
    return (
      prev.totalRequests !== next.totalRequests ||
      prev.requestsPerSecond !== next.requestsPerSecond ||
      JSON.stringify(prev.statusCodes) !== JSON.stringify(next.statusCodes) ||
      prev.latency.p50 !== next.latency.p50 ||
      prev.latency.p95 !== next.latency.p95 ||
      prev.latency.p99 !== next.latency.p99
    );
  }
}
