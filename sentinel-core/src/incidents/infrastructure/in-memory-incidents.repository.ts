import { Injectable } from '@nestjs/common';
import { IncidentStatus } from '../domain/incident-status.enum';
import { IncidentEntity } from '../entities/incident.entity';
import { IncidentLogEntity } from '../entities/incident-log.entity';
import {
  IncidentsRepository,
  IncidentWithLogs,
} from '../repositories/incidents.repository';

@Injectable()
export class InMemoryIncidentsRepository implements IncidentsRepository {
  private readonly incidents = new Map<string, IncidentEntity>();
  private readonly logs = new Map<string, IncidentLogEntity[]>();
  private nextLogId = 1;

  async createIncident(incident: IncidentEntity): Promise<IncidentEntity> {
    const now = new Date();
    const created = {
      ...incident,
      createdAt: incident.createdAt ?? now,
      updatedAt: incident.updatedAt ?? now,
      resolvedAt: incident.resolvedAt ?? null,
    };

    this.incidents.set(created.id, created);
    this.logs.set(created.id, []);

    return created;
  }

  async saveIncident(incident: IncidentEntity): Promise<IncidentEntity> {
    const saved = {
      ...incident,
      updatedAt: incident.updatedAt ?? new Date(),
    };

    this.incidents.set(saved.id, saved);

    return saved;
  }

  async findIncidentById(id: string): Promise<IncidentEntity | null> {
    return this.incidents.get(id) ?? null;
  }

  async findIncidentWithLogs(id: string): Promise<IncidentWithLogs | null> {
    const incident = this.incidents.get(id);

    if (!incident) {
      return null;
    }

    return {
      incident,
      logs: [...(this.logs.get(id) ?? [])],
    };
  }

  async listIncidents(status?: IncidentStatus): Promise<IncidentEntity[]> {
    const incidents = [...this.incidents.values()];

    if (!status) {
      return incidents;
    }

    return incidents.filter((incident) => incident.status === status);
  }

  async appendLog(
    log: Omit<IncidentLogEntity, 'id' | 'incident' | 'createdAt'>,
  ): Promise<IncidentLogEntity> {
    const created = {
      ...log,
      id: this.nextLogId++,
      createdAt: new Date(),
    } as IncidentLogEntity;
    const logs = this.logs.get(created.incidentId) ?? [];

    logs.push(created);
    this.logs.set(created.incidentId, logs);

    return created;
  }
}
