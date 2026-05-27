import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FailoverRule } from './failover-rule.entity';

@Injectable()
export class FailoverRuleRepository {
  constructor(
    @InjectRepository(FailoverRule)
    private readonly repo: Repository<FailoverRule>,
  ) {}

  async findByClient(clientId: string): Promise<FailoverRule | null> {
    return this.repo.findOne({ where: { clientId } });
  }

  async save(rule: FailoverRule): Promise<FailoverRule> {
    return this.repo.save(rule);
  }
}
