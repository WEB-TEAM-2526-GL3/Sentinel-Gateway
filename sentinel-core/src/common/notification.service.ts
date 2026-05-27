import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async notify(event: { type: string; payload: any }): Promise<void> {
    // TODO: Implement webhook/Slack/email notifications
    this.logger.log(`Notification stub: ${event.type}`, event.payload);
  }
}
