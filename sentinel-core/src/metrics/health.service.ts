import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private errorCounters = new Map<string, number>(); // providerId → consecutive errors
  private healthState = new Map<string, boolean>(); // providerId → healthy

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.subscribeToMetrics();
  }

  private subscribeToMetrics(): void {
    this.eventEmitter.on(
      'metrics.updated',
      (event: {
        clientId: string;
        providerId: string;
        metrics: { statusCodes: Record<string, number> };
      }) => {
        if (event.providerId === 'global') return; // skip global aggregates

        const hasErrors = this.hasErrorStatus(event.metrics.statusCodes);
        const current = this.errorCounters.get(event.providerId) ?? 0;

        if (hasErrors) {
          const newCount = current + 1;
          this.errorCounters.set(event.providerId, newCount);

          if (
            newCount >= 10 &&
            this.healthState.get(event.providerId) !== false
          ) {
            this.healthState.set(event.providerId, false);
            this.eventEmitter.emit('health.changed', {
              providerId: event.providerId,
              healthy: false,
            });
          }
        } else {
          this.errorCounters.set(event.providerId, 0);
          if (this.healthState.get(event.providerId) !== true) {
            this.healthState.set(event.providerId, true);
            this.eventEmitter.emit('health.changed', {
              providerId: event.providerId,
              healthy: true,
            });
          }
        }
      },
    );
  }

  private hasErrorStatus(statusCodes: Record<string, number>): boolean {
    return Object.keys(statusCodes).some(
      (code) => code.startsWith('5') || code === '429',
    );
  }

  getCurrent(providerId: string): boolean | null {
    return this.healthState.get(providerId) ?? null;
  }

  getAll(): Map<string, boolean> {
    return new Map(this.healthState);
  }
}
