import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenLimit } from './token-limit.entity';

@Injectable()
export class TokenLimitRepository {
  constructor(
    @InjectRepository(TokenLimit)
    private readonly repo: Repository<TokenLimit>,
  ) {}

  async findByProvider(providerId: string): Promise<TokenLimit | null> {
    return this.repo.findOne({ where: { providerId, isArchived: false } });
  }

  async save(limit: TokenLimit): Promise<TokenLimit> {
    return this.repo.save(limit);
  }

  async archive(id: string): Promise<void> {
    await this.repo.update(id, { isArchived: true });
  }
}
