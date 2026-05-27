import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { MessengerWebhookQueryDto } from './dto/messenger-webhook-query.dto';
import { MessengerWebhookService } from './messenger-webhook.service';
import type {
  MessengerRecipientSummary,
  PublicMessengerInboundEvent,
} from './types/messenger-inbound-event.model';

@Controller('messenger')
export class MessengerWebhookController {
  constructor(private readonly messenger: MessengerWebhookService) {}

  @Get('webhook')
  verifyWebhook(
    @Query() query: MessengerWebhookQueryDto,
    @Res() response: Response,
  ): void {
    const challenge = this.messenger.verifyWebhook(query);
    response.status(HttpStatus.OK).type('text/plain').send(challenge);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  receiveWebhook(@Body() body: Record<string, unknown>): string {
    this.messenger.handleIncomingWebhook(body);
    return 'EVENT_RECEIVED';
  }

  @Get('events')
  listEvents(
    @Query('senderId') senderId?: string,
    @Query('limit') limit?: string,
  ): PublicMessengerInboundEvent[] {
    return this.messenger.listEvents({ senderId, limit });
  }

  @Get('recipients')
  listRecipients(): MessengerRecipientSummary[] {
    return this.messenger.listRecipients();
  }
}
