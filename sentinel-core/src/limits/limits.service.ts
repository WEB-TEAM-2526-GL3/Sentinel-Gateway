import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RequestLimitRepository } from '../limits/request-limit.repository';
import { TokenLimitRepository } from '../limits/token-limit.repository';
import { RequestLimit } from './request-limit.entity';
import { TokenLimit } from './token-limit.entity';
import { SetRequestLimitDto } from './dto/set-request-limit.dto';
import { SetTokenLimitDto } from './dto/set-token-limit.dto';

@Injectable()
export class LimitsService {
  private readonly logger = new Logger(LimitsService.name);

  constructor(
    private readonly requestLimitRepo: RequestLimitRepository,
    private readonly tokenLimitRepo: TokenLimitRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.subscribeToMetrics();
  }

  private subscribeToMetrics(): void {
    // Request limits
    this.eventEmitter.on(
      'metrics.updated',
      async (event: {
        clientId: string;
        providerId: string;
        metrics: { totalRequests: number };
      }) => {
        if (event.clientId === 'global' || event.providerId === 'global')
          return;

        const limit = await this.requestLimitRepo.findByClientAndProvider(
          event.clientId,
          event.providerId,
        );
        if (!limit) return;

        if (event.metrics.totalRequests >= limit.maxRequests) {
          this.eventEmitter.emit('limit.exceeded', {
            clientId: event.clientId,
            providerId: event.providerId,
            limitId: limit.id,
            limitType: 'request',
            current: event.metrics.totalRequests,
            max: limit.maxRequests,
          });
        }
      },
    );

    // Token limits
    this.eventEmitter.on(
      'ai.tokens.updated',
      async (event: {
        providerId: string;
        modelName: string;
        total: number;
      }) => {
        const limit = await this.tokenLimitRepo.findByProvider(
          event.providerId,
        );
        if (!limit) return;

        if (event.total >= limit.maxTokens) {
          this.eventEmitter.emit('limit.exceeded', {
            clientId: 'global',
            providerId: event.providerId,
            limitId: limit.id,
            limitType: 'token',
            current: event.total,
            max: limit.maxTokens,
          });
        }
      },
    );
  }

  async getRequestLimit(
    clientId: string,
    providerId: string,
  ): Promise<RequestLimit | null> {
    return this.requestLimitRepo.findByClientAndProvider(clientId, providerId);
  }

  async setRequestLimit(dto: SetRequestLimitDto): Promise<RequestLimit> {
    const existing = await this.requestLimitRepo.findByClientAndProvider(
      dto.clientId,
      dto.providerId,
    );
    if (existing) await this.requestLimitRepo.archive(existing.id);
    return this.requestLimitRepo.save({
      clientId: dto.clientId,
      providerId: dto.providerId,
      maxRequests: dto.maxRequests,
      isArchived: false,
    } as RequestLimit);
  }

  async archiveRequestLimit(id: string): Promise<void> {
    await this.requestLimitRepo.archive(id);
  }

  async getTokenLimit(providerId: string): Promise<TokenLimit | null> {
    return this.tokenLimitRepo.findByProvider(providerId);
  }

  async setTokenLimit(dto: SetTokenLimitDto): Promise<TokenLimit> {
    const existing = await this.tokenLimitRepo.findByProvider(dto.providerId);
    if (existing) await this.tokenLimitRepo.archive(existing.id);
    return this.tokenLimitRepo.save({
      providerId: dto.providerId,
      maxTokens: dto.maxTokens,
      isArchived: false,
    } as TokenLimit);
  }

  async archiveTokenLimit(id: string): Promise<void> {
    await this.tokenLimitRepo.archive(id);
  }
}
