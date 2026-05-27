import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientRepository } from './client.repository';
import { LinkRepository } from '../links/link.repository';
import { Client } from './client.entity';
import { UpdateClientDto } from './dto/update-client.dto';
import { CreateClientDto } from './dto/create-client.dto';

@Injectable()
export class ClientService {
  constructor(
    private readonly clientRepo: ClientRepository,
    private readonly linkRepo: LinkRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createClient(dto: CreateClientDto): Promise<Client> {
    const client = new Client();
    client.name = dto.name;
    client.team = dto.team;
    client.status = 'active';
    client.primaryLinkId = null;
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

  async listClients(): Promise<Client[]> {
    return this.clientRepo.findAllActive();
  }

  async getClient(id: string): Promise<Client> {
    const client = await this.clientRepo.findById(id);
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async updateClient(id: string, dto: UpdateClientDto): Promise<Client> {
    const client = await this.clientRepo.findById(id);
    if (!client) throw new NotFoundException('Client not found');
    if (dto.name) client.name = dto.name;
    if (dto.team) client.team = dto.team;
    return this.clientRepo.save(client);
  }
}