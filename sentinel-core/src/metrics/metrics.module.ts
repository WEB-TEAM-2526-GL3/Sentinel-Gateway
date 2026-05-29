import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrometheusService } from './prometheus.service';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [HttpModule.register({ timeout: 5000 })],
  controllers: [MetricsController],
  providers: [PrometheusService, MetricsService],
  exports: [PrometheusService, MetricsService],
})
export class MetricsModule {}
