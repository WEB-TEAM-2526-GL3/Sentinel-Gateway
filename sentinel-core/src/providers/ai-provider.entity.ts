import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Provider } from './provider.entity';

@Entity('ai_providers')
export class AIProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ai_provider_name', type: 'text' })
  aiProviderName: string;

  @Column({ name: 'ai_model_name', type: 'text' })
  aiModelName: string;

  @OneToOne(() => Provider, (p) => p.aiProvider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_id' })
  provider: Provider;

  @Column({ name: 'provider_id', type: 'uuid', unique: true })
  providerId: string;
}
