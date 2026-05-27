import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { IncidentSeverity } from '../enums/incident-severity.enum';
import { MonitoringRuleType } from '../entities/monitoring-rule.entity';

export class CreateMonitoringRuleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  serviceName: string;

  @IsUUID()
  @IsOptional()
  providerId?: string;

  @IsEnum(MonitoringRuleType)
  type: MonitoringRuleType;

  /**
   * Required when type = ERROR_RATE.
   * Value between 0 and 1 (e.g. 0.10 = trigger when error rate exceeds 10%).
   */
  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  errorRateThreshold?: number;

  /**
   * Required when type = LATENCY_P95.
   * Trigger when p95 upstream latency exceeds this value in milliseconds.
   */
  @IsInt()
  @Min(1)
  @IsOptional()
  latencyThresholdMs?: number;

  /** Prometheus range string for metric queries. Defaults to '5m'. */
  @IsString()
  @IsOptional()
  metricWindow?: string;

  /** Minutes before the same rule can re-trigger. Defaults to 15. */
  @IsInt()
  @Min(1)
  @IsOptional()
  cooldownMinutes?: number;

  @IsEnum(IncidentSeverity)
  @IsOptional()
  severity?: IncidentSeverity;
}
