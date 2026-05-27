import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IncidentSeverity } from '../enums/incident-severity.enum';

export enum MonitoringRuleType {
  ERROR_RATE = 'ERROR_RATE',
  LATENCY_P95 = 'LATENCY_P95',
  UPSTREAM_HEALTH = 'UPSTREAM_HEALTH',
}

@Entity('monitoring_rules')
export class MonitoringRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ name: 'service_name' })
  serviceName: string;

  @Column({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId: string | null;

  @Column({ type: 'enum', enum: MonitoringRuleType })
  type: MonitoringRuleType;

  /** Fraction 0–1 that triggers an ERROR_RATE alert (e.g. 0.1 = 10% errors). */
  @Column({
    name: 'error_rate_threshold',
    type: 'decimal',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  errorRateThreshold: number | null;

  /** Upstream latency in ms that triggers a LATENCY_P95 alert. */
  @Column({ name: 'latency_threshold_ms', type: 'int', nullable: true })
  latencyThresholdMs: number | null;

  /** Prometheus range for metric queries: '1m', '5m', '15m', '1h'. */
  @Column({ name: 'metric_window', default: '5m' })
  metricWindow: string;

  /** Minutes to wait before re-triggering the same rule (prevents flood). */
  @Column({ name: 'cooldown_minutes', type: 'int', default: 15 })
  cooldownMinutes: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({
    type: 'enum',
    enum: IncidentSeverity,
    default: IncidentSeverity.MEDIUM,
  })
  severity: IncidentSeverity;

  @Column({ name: 'last_triggered_at', type: 'timestamp', nullable: true })
  lastTriggeredAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
