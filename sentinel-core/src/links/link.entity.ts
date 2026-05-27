import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type LinkKind =
  | 'primary'
  | 'secondary-active'
  | 'secondary-inactive'
  | 'archived';

@Entity('client_provider_links')
export class ClientProviderLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ type: 'varchar', length: 30 })
  kind: LinkKind;

  @Column({ name: 'incident_id', type: 'uuid', nullable: true })
  incidentId: string | null;

  @Column({ name: 'kong_service_name', type: 'text', nullable: true })
  kongServiceName: string | null;

  @Column({ name: 'kong_route_name', type: 'text', nullable: true })
  kongRouteName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
