import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type IncidentReason = 'dead' | 'requestLimit' | 'tokenLimit';

@Entity('incidents')
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  reason: IncidentReason;

  @CreateDateColumn({ type: 'timestamp' })
  timestamp: Date;

  @Column({ name: 'link_id', type: 'uuid' })
  linkId: string;

  @Column({ name: 'cached_client_id', type: 'uuid' })
  cachedClientId: string;

  @Column({ name: 'cached_provider_id', type: 'uuid' })
  cachedProviderId: string;

  @Column({ name: 'limit_rule_id', type: 'uuid', nullable: true })
  limitRuleId: string | null;
}
