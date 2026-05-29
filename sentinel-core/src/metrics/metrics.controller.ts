import { Controller, Sse } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { fromEvent, map, merge, Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import {
  HEALTH_CHANGED_EVENT,
  METRICS_POLL_FAILED_EVENT,
  METRICS_UPDATED_EVENT,
} from './events/metrics.events';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  @Sse('sse')
  streamMetrics(): Observable<MessageEvent> {
    return merge(
      fromEvent(this.eventEmitter, METRICS_UPDATED_EVENT).pipe(
        map((payload) => this.toMessage(METRICS_UPDATED_EVENT, payload)),
      ),
      fromEvent(this.eventEmitter, METRICS_POLL_FAILED_EVENT).pipe(
        map((payload) => this.toMessage(METRICS_POLL_FAILED_EVENT, payload)),
      ),
      fromEvent(this.eventEmitter, HEALTH_CHANGED_EVENT).pipe(
        map((payload) => this.toMessage(HEALTH_CHANGED_EVENT, payload)),
      ),
    );
  }

  private toMessage(type: string, payload: unknown): MessageEvent {
    return {
      type,
      data: JSON.stringify(payload),
    };
  }
}
