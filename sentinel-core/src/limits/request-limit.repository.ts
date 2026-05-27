import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestLimit } from './request-limit.entity';

@Injectable()
export class RequestLimitRepository {
  constructor(
    @InjectRepository(RequestLimit)
    private readonly repo: Repository<RequestLimit>,
  ) {}

  async findByClientAndProvider(
    clientId: string,
    providerId: string,
  ): Promise<RequestLimit | null> {
    return this.repo.findOne({
      where: { clientId, providerId, isArchived: false },
    });
  }

  async save(limit: RequestLimit): Promise<RequestLimit> {
    return this.repo.save(limit);
  }

  async archive(id: string): Promise<void> {
    await this.repo.update(id, { isArchived: true });
  }
}
