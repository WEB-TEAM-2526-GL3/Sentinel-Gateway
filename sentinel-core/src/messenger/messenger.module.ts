import { Module } from '@nestjs/common';
import { MessengerEventsRepository } from './messenger-events.repository';
import { MessengerWebhookController } from './messenger-webhook.controller';
import { MessengerWebhookService } from './messenger-webhook.service';

@Module({
  controllers: [MessengerWebhookController],
  providers: [MessengerWebhookService, MessengerEventsRepository],
  exports: [MessengerWebhookService],
})
export class MessengerModule {}
