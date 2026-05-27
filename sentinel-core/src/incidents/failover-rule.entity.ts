import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('failover_rules')
export class FailoverRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid', unique: true })
  clientId: string;

  @Column({ name: 'on_limit', type: 'boolean', default: false })
  onLimit: boolean;

  @Column({ name: 'on_dead', type: 'boolean', default: false })
  onDead: boolean;
}
