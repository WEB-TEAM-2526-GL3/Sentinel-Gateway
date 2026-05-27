import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('request_limits')
export class RequestLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId: string | null;

  @Column({ name: 'max_requests', type: 'int' })
  maxRequests: number;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived: boolean;
}
