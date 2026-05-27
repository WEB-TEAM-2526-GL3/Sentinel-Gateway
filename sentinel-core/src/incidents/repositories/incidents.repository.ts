import { IncidentStatus } from '../domain/incident-status.enum';
import { IncidentEntity } from '../entities/incident.entity';
import { IncidentLogEntity } from '../entities/incident-log.entity';

export interface IncidentWithLogs {
  incident: IncidentEntity;
  logs: IncidentLogEntity[];
}

export interface IncidentsRepository {
  createIncident(incident: IncidentEntity): Promise<IncidentEntity>;
  saveIncident(incident: IncidentEntity): Promise<IncidentEntity>;
  findIncidentById(id: string): Promise<IncidentEntity | null>;
  findIncidentWithLogs(id: string): Promise<IncidentWithLogs | null>;
  listIncidents(status?: IncidentStatus): Promise<IncidentEntity[]>;
  appendLog(log: Omit<IncidentLogEntity, 'id' | 'incident' | 'createdAt'>): Promise<IncidentLogEntity>;
}
