import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { MessengerWebhookQueryDto } from './dto/messenger-webhook-query.dto';
import { MessengerEventsRepository } from './messenger-events.repository';
import type {
  MessengerInboundEvent,
  MessengerRecipientSummary,
  PublicMessengerInboundEvent,
} from './types/messenger-inbound-event.model';

interface HandleIncomingResult {
  received: true;
  eventCount: number;
}

interface ListEventsQuery {
  senderId?: string;
  limit?: string;
}

@Injectable()
export class MessengerWebhookService {
  private readonly logger = new Logger(MessengerWebhookService.name);

  constructor(private readonly repository: MessengerEventsRepository) {}

  verifyWebhook(query: MessengerWebhookQueryDto): string {
    const expectedToken = process.env.MESSENGER_VERIFY_TOKEN;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];

    if (mode === 'subscribe' && expectedToken && token === expectedToken) {
      return query['hub.challenge'];
    }

    throw new ForbiddenException('Invalid Messenger verify token');
  }

  handleIncomingWebhook(body: Record<string, unknown>): HandleIncomingResult {
    const events = this.extractEvents(body);
    const savedEvents = this.repository.saveMany(events);

    if (savedEvents.length > 0) {
      this.logger.log(
        `Received ${savedEvents.length} Messenger event(s) from ${this.countSenders(
          savedEvents,
        )} sender(s)`,
      );
    }

    return {
      received: true,
      eventCount: savedEvents.length,
    };
  }

  listEvents(query: ListEventsQuery): PublicMessengerInboundEvent[] {
    return this.repository
      .findAll({
        senderId: query.senderId,
        limit: this.parseLimit(query.limit),
      })
      .map((event) => this.toPublicEvent(event));
  }

  listRecipients(): MessengerRecipientSummary[] {
    return this.repository.findRecipients();
  }

  private extractEvents(
    body: Record<string, unknown>,
  ): Array<Omit<MessengerInboundEvent, 'id'>> {
    const entries = this.getArray(body.entry);
    const receivedAt = new Date();
    const events: Array<Omit<MessengerInboundEvent, 'id'>> = [];

    for (const entryValue of entries) {
      const entry = this.getRecord(entryValue);
      const messagingItems = this.getArray(entry?.messaging);

      for (const itemValue of messagingItems) {
        const item = this.getRecord(itemValue);
        if (!item) continue;

        const sender = this.getRecord(item.sender);
        const recipient = this.getRecord(item.recipient);
        const message = this.getRecord(item.message);
        const postback = this.getRecord(item.postback);

        events.push({
          senderId: this.getString(sender?.id),
          recipientId: this.getString(recipient?.id),
          messageText: this.getString(message?.text),
          postbackPayload: this.getString(postback?.payload),
          timestamp: this.toDate(item.timestamp),
          receivedAt,
          raw: { ...item },
        });
      }
    }

    return events;
  }

  private toPublicEvent(
    event: MessengerInboundEvent,
  ): PublicMessengerInboundEvent {
    return {
      id: event.id,
      senderId: event.senderId,
      recipientId: event.recipientId,
      messageText: event.messageText,
      postbackPayload: event.postbackPayload ?? null,
      timestamp: event.timestamp,
      receivedAt: event.receivedAt,
    };
  }

  private parseLimit(limit: string | undefined): number | undefined {
    if (!limit) return undefined;

    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed <= 0) return undefined;

    return Math.min(parsed, 100);
  }

  private countSenders(events: MessengerInboundEvent[]): number {
    return new Set(events.map((event) => event.senderId).filter(Boolean)).size;
  }

  private getRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private getArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private getString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private toDate(value: unknown): Date | undefined {
    if (typeof value !== 'number') return undefined;

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}
