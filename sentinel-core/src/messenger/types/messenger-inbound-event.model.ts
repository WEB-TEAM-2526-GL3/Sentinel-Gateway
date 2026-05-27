export interface MessengerInboundEvent {
  id: string;
  senderId?: string;
  recipientId?: string;
  messageText?: string;
  postbackPayload?: string;
  timestamp?: Date;
  receivedAt: Date;
  raw: Record<string, unknown>;
}

export interface PublicMessengerInboundEvent {
  id: string;
  senderId?: string;
  recipientId?: string;
  messageText?: string;
  postbackPayload?: string | null;
  timestamp?: Date;
  receivedAt: Date;
}

export interface MessengerRecipientSummary {
  senderId: string;
  lastMessageText?: string;
  lastSeenAt: Date;
}
