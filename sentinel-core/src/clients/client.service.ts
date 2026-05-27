import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientRepository } from './client.repository';
import { LinkRepository } from '../links/link.repository';
import { Client } from './client.entity';

@Injectable()
export class ClientService {
  constructor(
    private readonly clientRepo: ClientRepository,
    private readonly linkRepo: LinkRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createClient(dto: { name: string; team: string }): Promise<Client> {
    const client = this.clientRepo.create({ ...dto, status: 'active', primaryLinkId: null });
    return this.clientRepo.save(client);
  }

  async archiveClient(id: string): Promise<void> {
    const client = await this.clientRepo.findById(id);
    if (!client) throw new NotFoundException('Client not found');

    // Archive all links first
    const links = await this.linkRepo.findByClient(id);
    for (const link of links) {
      await this.linkRepo.archive(link.id);
    }

    await this.clientRepo.archive(id);
    this.eventEmitter.emit('client.archived', { clientId: id });
  }
}