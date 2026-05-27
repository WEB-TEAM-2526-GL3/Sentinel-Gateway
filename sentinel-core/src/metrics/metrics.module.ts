import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrometheusService } from './prometheus.service';
import { MetricsService } from './metrics.service';
import { HealthService } from './health.service';
import { LimitsService } from '../limits/limits.service';
import { LinkModule } from '../links/link.module';
import { LimitModule } from '../limits/limit.module';
import { ProviderModule } from '../providers/provider.module';

@Module({
  imports: [
    HttpModule.register({ timeout: 5000 }),
    LinkModule,
    LimitModule,
    ProviderModule,
  ],
  providers: [PrometheusService, MetricsService, HealthService, LimitsService],
  exports: [PrometheusService, MetricsService, HealthService, LimitsService],
})
export class MetricsModule {}
