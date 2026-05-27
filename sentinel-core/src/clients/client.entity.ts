import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type ClientStatus = 'active' | 'dead' | 'limit' | 'archived';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  team: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: ClientStatus;

  @Column({ name: 'primary_link_id', type: 'uuid', nullable: true })
  primaryLinkId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
