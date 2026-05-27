import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from './incident.entity';

@Injectable()
export class IncidentRepository {
  constructor(
    @InjectRepository(Incident)
    private readonly repo: Repository<Incident>,
  ) {}

  async create(incident: Partial<Incident>): Promise<Incident> {
    return this.repo.save(incident);
  }

  async findByClient(clientId: string): Promise<Incident[]> {
    return this.repo.find({
      where: { cachedClientId: clientId },
      order: { timestamp: 'DESC' },
    });
  }

  async findByLink(linkId: string): Promise<Incident[]> {
    return this.repo.find({ where: { linkId }, order: { timestamp: 'DESC' } });
  }

  async countActiveByClient(clientId: string): Promise<number> {
    return this.repo.count({ where: { cachedClientId: clientId } });
  }
}
