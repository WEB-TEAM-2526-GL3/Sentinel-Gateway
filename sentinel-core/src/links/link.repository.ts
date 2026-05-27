import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ClientProviderLink, LinkKind } from './link.entity';

@Injectable()
export class LinkRepository {
  constructor(
    @InjectRepository(ClientProviderLink)
    private readonly repo: Repository<ClientProviderLink>,
  ) {}

  async findById(id: string): Promise<ClientProviderLink | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByClient(clientId: string): Promise<ClientProviderLink[]> {
    return this.repo.find({ where: { clientId } });
  }

  async findPrimary(clientId: string): Promise<ClientProviderLink | null> {
    return this.repo.findOne({ where: { clientId, kind: 'primary' } });
  }

  async findActiveSecondaries(clientId: string): Promise<ClientProviderLink[]> {
    return this.repo.find({ where: { clientId, kind: 'secondary-active' } });
  }

  async findByProvider(providerId: string): Promise<ClientProviderLink[]> {
    return this.repo.find({ where: { providerId } });
  }

  async findAllActive(): Promise<ClientProviderLink[]> {
    return this.repo.find({
      where: { kind: In(['primary', 'secondary-active']) },
    });
  }

  async save(link: ClientProviderLink): Promise<ClientProviderLink> {
    return this.repo.save(link);
  }

  async archive(id: string): Promise<void> {
    await this.repo.update(id, { kind: 'archived' });
  }
}
