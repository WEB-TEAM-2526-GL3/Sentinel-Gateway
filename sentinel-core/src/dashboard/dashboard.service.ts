import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Response } from 'express';
import { v4 as uuid } from 'uuid';
import { MetricsService } from '../metrics/metrics.service';
import { HealthService } from '../metrics/health.service';
import { LinkService } from '../links/link.service';
import { ProviderRepository } from '../providers/provider.repository';
import { ClientRepository } from '../clients/client.repository';
import { PrometheusService } from '../metrics/prometheus.service';

interface SseConnection {
  id: string;
  view: 'overview' | 'client-detail' | 'provider-detail' | 'provider-list';
  filter: { clientId?: string; providerId?: string };
  response: Response;
  queue: any[];
  draining: boolean;
  lastActivity: Date;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);
  private connections = new Map<string, SseConnection>();

  constructor(
    private readonly metricsService: MetricsService,
    private readonly healthService: HealthService,
    private readonly linkService: LinkService,
    private readonly providerRepo: ProviderRepository,
    private readonly clientRepo: ClientRepository,
    private readonly prometheusService: PrometheusService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.subscribeToEvents();
    setInterval(() => this.drainAllQueues(), 2000);
    setInterval(() => this.sendHeartbeats(), 10000);
  }

  // ─── Connection Management ───────────────────────────────────────

  addConnection(
    view: 'overview' | 'client-detail' | 'provider-detail' | 'provider-list',
    filter: { clientId?: string; providerId?: string },
    response: Response,
  ): string {
    const id = uuid();
    const conn: SseConnection = {
      id,
      view,
      filter,
      response,
      queue: [],
      draining: false,
      lastActivity: new Date(),
    };
    this.connections.set(id, conn);
    this.sendSnapshot(conn);
    return id;
  }

  removeConnection(id: string): void {
    this.connections.delete(id);
  }

  // ─── Snapshot ────────────────────────────────────────────────────

  private async sendSnapshot(conn: SseConnection): Promise<void> {
    let snapshot: any = {
      type: 'snapshot',
      data: { view: conn.view, timestamp: new Date().toISOString() },
    };

    if (conn.view === 'overview') {
      const globalMetrics = this.metricsService.getLatest({});
      const providers = await this.providerRepo.findAllActive();
      const health = this.healthService.getAll();

      snapshot.data = {
        ...snapshot.data,
        totalRequests: globalMetrics?.totalRequests ?? 0,
        requestsPerSecond: globalMetrics?.requestsPerSecond ?? 0,
        errorRate: globalMetrics
          ? this.computeErrorRate(globalMetrics.statusCodes)
          : 0,
        latency: globalMetrics?.latency ?? { p50: 0, p95: 0, p99: 0 },
        providers: providers.map((p) => ({
          id: p.id,
          name: p.kongServiceName,
          kind: p.kind,
          healthy: health.get(p.id) ?? true,
        })),
      };
    } else if (conn.view === 'client-detail' && conn.filter.clientId) {
      const client = await this.clientRepo.findById(conn.filter.clientId);
      const status = await this.linkService.getClientStatus(
        conn.filter.clientId,
      );
      const metrics = this.metricsService.getLatest({
        clientId: conn.filter.clientId,
      });

      snapshot.data = {
        ...snapshot.data,
        clientId: client?.id,
        clientName: client?.name,
        status: client?.status,
        selectedLink: status.selectedLink,
        secondaries: status.secondaries,
        metrics: metrics ?? {
          totalRequests: 0,
          requestsPerSecond: 0,
          statusCodes: {},
          latency: { p50: 0, p95: 0, p99: 0 },
        },
      };
    } else if (conn.view === 'provider-detail' && conn.filter.providerId) {
      const provider = await this.providerRepo.findById(conn.filter.providerId);
      const metrics = this.metricsService.getLatest({
        providerId: conn.filter.providerId,
      });
      const healthy = this.healthService.getCurrent(conn.filter.providerId);

      snapshot.data = {
        ...snapshot.data,
        providerId: provider?.id,
        providerName: provider?.kongServiceName,
        providerKind: provider?.kind,
        healthy,
        totalRequests: metrics?.totalRequests ?? 0,
        errorRate: metrics ? this.computeErrorRate(metrics.statusCodes) : 0,
        latency: metrics?.latency ?? { p50: 0, p95: 0, p99: 0 },
      };
    } else if (conn.view === 'provider-list') {
      const providers = await this.providerRepo.findAllActive();
      const health = this.healthService.getAll();

      snapshot.data = {
        ...snapshot.data,
        providers: providers.map((p) => ({
          id: p.id,
          name: p.kongServiceName,
          kind: p.kind,
          baseUrl: p.baseUrl,
          healthy: health.get(p.id) ?? true,
        })),
      };
    }

    conn.queue.push(snapshot);
    this.drainQueue(conn);
  }

  // ─── Event Handlers ──────────────────────────────────────────────

  private subscribeToEvents(): void {
    this.eventEmitter.on('metrics.updated', (evt) => {
      this.broadcastToMatching(evt, {
        type: 'update',
        path: 'metrics',
        data: evt.metrics,
      });
    });

    this.eventEmitter.on('health.changed', (evt) => {
      this.broadcastToMatching(evt, {
        type: 'update',
        path: `providers.${evt.providerId}.healthy`,
        data: evt.healthy,
      });
    });

    this.eventEmitter.on('limit.exceeded', (evt) => {
      this.broadcastToMatching(evt, {
        type: 'update',
        path: 'limits',
        data: {
          clientId: evt.clientId,
          providerId: evt.providerId,
          exceeded: true,
        },
      });
    });

    this.eventEmitter.on('link.primaryChanged', async (evt) => {
      if (evt.clientId) {
        const status = await this.linkService.getClientStatus(evt.clientId);
        this.broadcastToMatching(evt, {
          type: 'update',
          path: 'selectedLink',
          data: status.selectedLink,
        });
      }
    });

    this.eventEmitter.on('link.activated', (evt) => {
      this.broadcastToMatching(evt, {
        type: 'update',
        path: 'secondaries',
        data: evt,
      });
    });

    this.eventEmitter.on('incident.created', (incident) => {
      this.broadcastToMatching(incident, {
        type: 'update',
        path: 'activeIncidents',
        data: incident,
      });
    });
  }

  // ─── Broadcasting ────────────────────────────────────────────────

  private broadcastToMatching(event: any, message: any): void {
    for (const conn of this.connections.values()) {
      if (this.isRelevant(conn, event)) {
        conn.queue.push(message);
        this.drainQueue(conn);
      }
    }
  }

  private isRelevant(conn: SseConnection, event: any): boolean {
    if (conn.view === 'overview') return !event.clientId; // global events only
    if (conn.view === 'client-detail')
      return event.clientId === conn.filter.clientId;
    if (conn.view === 'provider-detail')
      return event.providerId === conn.filter.providerId;
    if (conn.view === 'provider-list') return !event.clientId; // global provider events
    return false;
  }

  // ─── Queue Draining ──────────────────────────────────────────────

  private drainQueue(conn: SseConnection): void {
    if (conn.draining) return;
    conn.draining = true;
    try {
      while (conn.queue.length > 0) {
        const msg = conn.queue.shift();
        conn.response.write(
          `event: ${msg.type}\ndata: ${JSON.stringify(msg.data)}\n\n`,
        );
        conn.lastActivity = new Date();
      }
    } finally {
      conn.draining = false;
    }
  }

  private drainAllQueues(): void {
    for (const conn of this.connections.values()) {
      this.drainQueue(conn);
    }
  }

  private sendHeartbeats(): void {
    const msg = { type: 'heartbeat', timestamp: new Date().toISOString() };
    for (const conn of this.connections.values()) {
      conn.queue.push(msg);
      this.drainQueue(conn);
    }
  }

  // ─── History REST ────────────────────────────────────────────────

  async getHistoryRequests(
    filter: { clientId?: string; providerId?: string },
    range: string,
    step: string,
  ): Promise<{ timestamp: number; value: number }[]> {
    const labels = this.buildServiceLabels(filter);
    const query = `sum(rate(kong_http_requests_total${labels}[${range}]))`;
    const result = await this.prometheusService.queryRange(query, '', '', step);
    return this.formatMatrix(result);
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private computeErrorRate(statusCodes: Record<string, number>): number {
    const total = Object.values(statusCodes).reduce((a, b) => a + b, 0);
    const errors = Object.entries(statusCodes)
      .filter(([code]) => code.startsWith('4') || code.startsWith('5'))
      .reduce((sum, [, count]) => sum + count, 0);
    return total > 0 ? errors / total : 0;
  }

  private buildServiceLabels(filter: {
    clientId?: string;
    providerId?: string;
  }): string {
    if (filter.clientId && filter.providerId) {
      return `{service="${filter.clientId}-${filter.providerId}-svc"}`;
    }
    if (filter.clientId) return `{service=~"${filter.clientId}-.*"}`;
    if (filter.providerId) return `{service=~".*-${filter.providerId}-svc"}`;
    return '';
  }

  private formatMatrix(result: any): any[] {
    if (result?.data?.result?.[0]?.values) {
      return result.data.result[0].values.map((v: any) => ({
        timestamp: v[0],
        value: parseFloat(v[1]),
      }));
    }
    return [];
  }
}
