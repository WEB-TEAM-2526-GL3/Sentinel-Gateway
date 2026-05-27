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

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'model_name', type: 'text' })
  modelName: string;

  @OneToOne(() => Provider, (p) => p.aiProvider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_id' })
  provider: Provider;

  @Column({ name: 'provider_id', type: 'uuid', unique: true })
  providerId: string;
}
