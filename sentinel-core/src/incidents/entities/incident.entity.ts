import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IncidentSeverity } from '../domain/incident-severity.enum';
import { IncidentStatus } from '../domain/incident-status.enum';
import { IncidentLogEntity } from './incident-log.entity';

@Entity('incidents')
export class IncidentEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ type: 'enum', enum: IncidentSeverity })
  severity: IncidentSeverity;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.OPEN })
  status: IncidentStatus;

  @Column({ name: 'fallback_provider_id', type: 'uuid', nullable: true })
  fallbackProviderId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @OneToMany(() => IncidentLogEntity, (log) => log.incident)
  logs: IncidentLogEntity[];
}
