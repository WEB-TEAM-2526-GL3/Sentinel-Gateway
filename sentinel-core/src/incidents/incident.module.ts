import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incident } from './incident.entity';
import { FailoverRule } from './failover-rule.entity';
import { IncidentRepository } from './incident.repository';
import { FailoverRuleRepository } from './failover-rule.repository';
import { IncidentService } from './incident.service';
import { FailoverService } from './failover.service';
import { LinkModule } from '../links/link.module';
import { IncidentsController } from './incidents.controller';

@Module({
  controllers: [IncidentsController],
  imports: [TypeOrmModule.forFeature([Incident, FailoverRule]), LinkModule],
  providers: [
    IncidentRepository,
    FailoverRuleRepository,
    IncidentService,
    FailoverService,
  ],
  exports: [
    IncidentRepository,
    FailoverRuleRepository,
    IncidentService,
    FailoverService,
  ],
})
export class IncidentModule {}
