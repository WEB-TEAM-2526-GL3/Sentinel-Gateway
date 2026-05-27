import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { IncidentSeverity } from '../enums/incident-severity.enum';
import { MonitoringRuleType } from '../entities/monitoring-rule.entity';

export class UpdateMonitoringRuleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  serviceName?: string;

  @IsUUID()
  @IsOptional()
  providerId?: string;

  @IsEnum(MonitoringRuleType)
  @IsOptional()
  type?: MonitoringRuleType;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  errorRateThreshold?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  latencyThresholdMs?: number;

  @IsString()
  @IsOptional()
  metricWindow?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  cooldownMinutes?: number;

  @IsEnum(IncidentSeverity)
  @IsOptional()
  severity?: IncidentSeverity;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
