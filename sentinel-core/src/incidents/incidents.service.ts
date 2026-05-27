import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { KongAdapterService } from '../kong-adapter/kong-adapter.service';
import { ActivateFallbackDto } from './dto/activate-fallback.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentActionDto } from './dto/incident-action.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { Incident } from './domain/incident';
import { IncidentLogAction } from './domain/incident-log-action.enum';
import { IncidentStatus } from './domain/incident-status.enum';
import { IncidentEntity } from './entities/incident.entity';
import { IncidentLogEntity } from './entities/incident-log.entity';
import { INCIDENTS_REPOSITORY } from './incidents.constants';
import type {
  IncidentsRepository,
  IncidentWithLogs,
} from './repositories/incidents.repository';

@Injectable()
export class IncidentsService {
  constructor(
    @Inject(INCIDENTS_REPOSITORY)
    private readonly incidentsRepository: IncidentsRepository,
    private readonly kongAdapter: KongAdapterService,
  ) {}

  async createIncident(input: CreateIncidentDto): Promise<IncidentWithLogs> {
    const incident = await this.incidentsRepository.createIncident({
      id: randomUUID(),
      serviceId: input.serviceId,
      providerId: input.providerId,
      severity: input.severity,
      reason: input.reason,
      status: IncidentStatus.OPEN,
      fallbackProviderId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      resolvedAt: null,
    } as IncidentEntity);

    await this.appendLog({
      incidentId: incident.id,
      adminId: input.adminId,
      adminName: input.adminName,
      action: IncidentLogAction.CREATED,
      details: { reason: input.reason, severity: input.severity },
    });

    return this.getIncidentWithLogs(incident.id);
  }

  async getIncidentWithLogs(id: string): Promise<IncidentWithLogs> {
    const incident = await this.incidentsRepository.findIncidentWithLogs(id);

    if (!incident) {
      throw new NotFoundException(`Incident "${id}" was not found`);
    }

    return incident;
  }

  async listIncidents(status?: IncidentStatus): Promise<IncidentEntity[]> {
    return this.incidentsRepository.listIncidents(status);
  }

  async sendMessage(input: SendMessageDto): Promise<IncidentLogEntity> {
    await this.getIncidentOrThrow(input.incidentId);

    return this.appendLog({
      incidentId: input.incidentId,
      adminId: input.adminId,
      adminName: input.adminName,
      action: IncidentLogAction.MESSAGE,
      details: { message: input.message },
    });
  }

  async acknowledge(input: IncidentActionDto): Promise<IncidentWithLogs> {
    const incident = await this.getIncidentOrThrow(input.incidentId);
    const updated = this.runStateTransition(() =>
      this.toDomain(incident).acknowledge(),
    );
    await this.incidentsRepository.saveIncident(this.toEntity(updated));
    await this.appendLog({
      incidentId: input.incidentId,
      adminId: input.adminId,
      adminName: input.adminName,
      action: IncidentLogAction.ACKNOWLEDGED,
      details: { notes: input.notes ?? null },
    });

    return this.getIncidentWithLogs(input.incidentId);
  }

  async resolve(input: IncidentActionDto): Promise<IncidentWithLogs> {
    const incident = await this.getIncidentOrThrow(input.incidentId);
    const updated = this.runStateTransition(() =>
      this.toDomain(incident).resolve(),
    );
    await this.incidentsRepository.saveIncident(this.toEntity(updated));
    await this.appendLog({
      incidentId: input.incidentId,
      adminId: input.adminId,
      adminName: input.adminName,
      action: IncidentLogAction.RESOLVED,
      details: { notes: input.notes ?? null },
    });

    return this.getIncidentWithLogs(input.incidentId);
  }

  async activateFallback(input: ActivateFallbackDto): Promise<IncidentWithLogs> {
    const incident = await this.getIncidentOrThrow(input.incidentId);
    const updated = this.runStateTransition(() =>
      this.toDomain(incident).activateFallback(input.fallbackProviderId),
    );

    try {
      await this.kongAdapter.activateFallback({
        serviceName: input.serviceName,
        fallbackUrl: input.fallbackUrl,
        fallbackProviderId: input.fallbackProviderId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Kong error';
      throw new BadRequestException(`Fallback activation failed: ${message}`);
    }

    await this.incidentsRepository.saveIncident(this.toEntity(updated));
    await this.appendLog({
      incidentId: input.incidentId,
      adminId: input.adminId,
      adminName: input.adminName,
      action: IncidentLogAction.FALLBACK_ACTIVATED,
      details: {
        serviceName: input.serviceName,
        fallbackProviderId: input.fallbackProviderId,
        fallbackUrl: input.fallbackUrl,
      },
    });

    return this.getIncidentWithLogs(input.incidentId);
  }

  private async getIncidentOrThrow(id: string): Promise<IncidentEntity> {
    const incident = await this.incidentsRepository.findIncidentById(id);

    if (!incident) {
      throw new NotFoundException(`Incident "${id}" was not found`);
    }

    return incident;
  }

  private async appendLog(
    log: Omit<IncidentLogEntity, 'id' | 'incident' | 'createdAt'>,
  ): Promise<IncidentLogEntity> {
    return this.incidentsRepository.appendLog(log);
  }

  private runStateTransition(action: () => Incident): Incident {
    try {
      return action();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid incident transition';
      throw new BadRequestException(message);
    }
  }

  private toDomain(entity: IncidentEntity): Incident {
    try {
      return Incident.create({
        id: entity.id,
        serviceId: entity.serviceId,
        providerId: entity.providerId,
        severity: entity.severity,
        reason: entity.reason,
        status: entity.status,
        fallbackProviderId: entity.fallbackProviderId,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        resolvedAt: entity.resolvedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid incident';
      throw new BadRequestException(message);
    }
  }

  private toEntity(incident: Incident): IncidentEntity {
    return {
      id: incident.id,
      serviceId: incident.serviceId,
      providerId: incident.providerId,
      severity: incident.severity,
      reason: incident.reason,
      status: incident.status,
      fallbackProviderId: incident.fallbackProviderId,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      resolvedAt: incident.resolvedAt,
    } as IncidentEntity;
  }
}
