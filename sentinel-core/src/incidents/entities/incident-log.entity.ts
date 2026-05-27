import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IncidentLogAction } from '../domain/incident-log-action.enum';
import { IncidentEntity } from './incident.entity';

@Entity('incident_logs')
export class IncidentLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'incident_id', type: 'uuid' })
  incidentId: string;

  @Column({ name: 'admin_id' })
  adminId: string;

  @Column({ name: 'admin_name' })
  adminName: string;

  @Column({ type: 'enum', enum: IncidentLogAction })
  action: IncidentLogAction;

  @Column({ type: 'jsonb', default: {} })
  details: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => IncidentEntity, (incident) => incident.logs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'incident_id' })
  incident: IncidentEntity;
}
