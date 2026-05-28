import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { AIProvider } from './ai-provider.entity';

export type ProviderKind = 'llm' | 'generic';

export type ProviderAuth =
  | { method: 'bearer'; headerName: string; encryptedApiKey: string }
  | { method: 'apiKey'; headerName: string; encryptedApiKey: string }
  | { method: 'query'; paramName: string; encryptedApiKey: string };

@Entity('providers')
export class Provider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  kind: ProviderKind;

  @Column({ name: 'kong_service_name', type: 'text', unique: true })
  kongServiceName: string;

  @Column({ name: 'display_name', type: 'text' })
  displayName: string;

  @Column({ name: 'base_url', type: 'text' })
  baseUrl: string;

  @Column({ name: 'auth_method', type: 'varchar', length: 20 })
  authMethod: 'bearer' | 'apiKey' | 'query';

  @Column({ name: 'auth_header_name', type: 'text', nullable: true })
  authHeaderName: string | null;

  @Column({ name: 'auth_param_name', type: 'text', nullable: true })
  authParamName: string | null;

  @Column({ name: 'encrypted_api_key', type: 'text' })
  encryptedApiKey: string;

  @Column({ name: 'is_archived', type: 'boolean', default: false })
  isArchived: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => AIProvider, (ai) => ai.provider, { cascade: true })
  aiProvider: AIProvider;

  get auth(): ProviderAuth {
    switch (this.authMethod) {
      case 'bearer':
        return {
          method: 'bearer',
          headerName: this.authHeaderName!,
          encryptedApiKey: this.encryptedApiKey,
        };
      case 'apiKey':
        return {
          method: 'apiKey',
          headerName: this.authHeaderName!,
          encryptedApiKey: this.encryptedApiKey,
        };
      case 'query':
        return {
          method: 'query',
          paramName: this.authParamName!,
          encryptedApiKey: this.encryptedApiKey,
        };
    }
  }
}
