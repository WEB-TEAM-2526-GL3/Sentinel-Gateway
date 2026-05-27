import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IncidentStatus } from '../domain/incident-status.enum';
import { IncidentEntity } from '../entities/incident.entity';
import { IncidentLogEntity } from '../entities/incident-log.entity';
import {
  IncidentsRepository,
  IncidentWithLogs,
} from '../repositories/incidents.repository';

@Injectable()
export class TypeormIncidentsRepository implements IncidentsRepository {
  constructor(
    @InjectRepository(IncidentEntity)
    private readonly incidents: Repository<IncidentEntity>,
    @InjectRepository(IncidentLogEntity)
    private readonly logs: Repository<IncidentLogEntity>,
  ) {}

  async createIncident(incident: IncidentEntity): Promise<IncidentEntity> {
    return this.incidents.save(this.incidents.create(incident));
  }

  async saveIncident(incident: IncidentEntity): Promise<IncidentEntity> {
    return this.incidents.save(incident);
  }

  async findIncidentById(id: string): Promise<IncidentEntity | null> {
    return this.incidents.findOne({ where: { id } });
  }

  async findIncidentWithLogs(id: string): Promise<IncidentWithLogs | null> {
    const incident = await this.findIncidentById(id);

    if (!incident) {
      return null;
    }

    const logs = await this.logs.find({
      where: { incidentId: id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return { incident, logs };
  }

  async listIncidents(status?: IncidentStatus): Promise<IncidentEntity[]> {
    return this.incidents.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async appendLog(
    log: Omit<IncidentLogEntity, 'id' | 'incident' | 'createdAt'>,
  ): Promise<IncidentLogEntity> {
    return this.logs.save(this.logs.create(log));
  }
}
