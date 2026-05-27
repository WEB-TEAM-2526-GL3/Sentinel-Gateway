import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('token_limits')
export class TokenLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ name: 'max_tokens', type: 'int' })
  maxTokens: number;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived: boolean;
}
