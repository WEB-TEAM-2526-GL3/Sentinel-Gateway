import { Injectable } from '@nestjs/common';
import { FailoverRuleRepository } from './failover-rule.repository';
import { FailoverRule } from './failover-rule.entity';
import { SetFailoverRuleDto } from './dto/set-failover-rule.dto';
@Injectable()
export class FailoverService {
  constructor(private readonly failoverRepo: FailoverRuleRepository) {}

  async shouldFailover(
    clientId: string,
    reason: 'dead' | 'limit',
  ): Promise<boolean> {
    const rule = await this.failoverRepo.findByClient(clientId);
    if (!rule) return false;

    return reason === 'dead' ? rule.onDead : rule.onLimit;
  }

  async getRule(clientId: string): Promise<FailoverRule | null> {
    return this.failoverRepo.findByClient(clientId);
  }

  async setRule(dto: SetFailoverRuleDto): Promise<FailoverRule> {
    const rule = await this.failoverRepo.save({
      clientId: dto.clientId,
      onLimit: dto.onLimit,
      onDead: dto.onDead,
    } as FailoverRule);
    return rule;
  }
}
