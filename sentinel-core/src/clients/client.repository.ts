import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Client } from './client.entity';

@Injectable()
export class ClientRepository {
  constructor(
    @InjectRepository(Client)
    private readonly repo: Repository<Client>,
  ) {}

  async findById(id: string): Promise<Client | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findAllActive(): Promise<Client[]> {
    return this.repo.find({
      where: { status: In(['active', 'dead', 'limit']) },
    });
  }

  async save(client: Client): Promise<Client> {
    return this.repo.save(client);
  }

  async archive(id: string): Promise<void> {
    await this.repo.update(id, { status: 'archived' });
  }
}
