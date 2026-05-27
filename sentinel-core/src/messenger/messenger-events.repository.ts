import { Injectable } from '@nestjs/common';
import type {
  MessengerInboundEvent,
  MessengerRecipientSummary,
} from './types/messenger-inbound-event.model';

interface MessengerEventFilters {
  senderId?: string;
  limit?: number;
}

@Injectable()
export class MessengerEventsRepository {
  private readonly events: MessengerInboundEvent[] = [];
  private sequence = 0;

  saveMany(
    events: Array<Omit<MessengerInboundEvent, 'id'>>,
  ): MessengerInboundEvent[] {
    const savedEvents = events.map((event) => {
      const savedEvent: MessengerInboundEvent = {
        ...event,
        id: this.nextEventId(),
        raw: { ...event.raw },
        timestamp: event.timestamp ? new Date(event.timestamp) : undefined,
        receivedAt: new Date(event.receivedAt),
      };

      this.events.push(savedEvent);
      return this.cloneEvent(savedEvent);
    });

    return savedEvents;
  }

  findAll(filters: MessengerEventFilters = {}): MessengerInboundEvent[] {
    const limit =
      filters.limit && filters.limit > 0 ? filters.limit : undefined;

    const filteredEvents = this.events
      .filter((event) =>
        filters.senderId === undefined
          ? true
          : event.senderId === filters.senderId,
      )
      .slice()
      .reverse();

    return (limit ? filteredEvents.slice(0, limit) : filteredEvents).map(
      (event) => this.cloneEvent(event),
    );
  }

  findRecipients(): MessengerRecipientSummary[] {
    const recipients = new Map<string, MessengerRecipientSummary>();

    for (const event of this.events) {
      if (!event.senderId) continue;

      const current = recipients.get(event.senderId);
      if (!current || event.receivedAt > current.lastSeenAt) {
        recipients.set(event.senderId, {
          senderId: event.senderId,
          lastMessageText: event.messageText,
          lastSeenAt: new Date(event.receivedAt),
        });
      }
    }

    return Array.from(recipients.values()).sort(
      (left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime(),
    );
  }

  private nextEventId(): string {
    this.sequence += 1;
    return `msg_evt_${String(this.sequence).padStart(3, '0')}`;
  }

  private cloneEvent(event: MessengerInboundEvent): MessengerInboundEvent {
    return {
      ...event,
      raw: { ...event.raw },
      timestamp: event.timestamp ? new Date(event.timestamp) : undefined,
      receivedAt: new Date(event.receivedAt),
    };
  }
}
