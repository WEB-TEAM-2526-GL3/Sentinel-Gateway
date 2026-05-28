import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivateFallbackDto } from './dto/activate-fallback.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentActionDto } from './dto/incident-action.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { IncidentLogAction } from './enum/incident-log-action.enum';
import { IncidentStatus } from './enum/incident-status.enum';
import { IncidentEntity } from './entities/incident.entity';
import { IncidentLogEntity } from './entities/incident-log.entity';
import { GenericService } from '../common/generic.service';
import { KongAdapterService } from '../gateway-adapter/kong/kong-adapter.service';

export type IncidentSnapshot = {
  incident: IncidentEntity;
  logs: IncidentLogEntity[];
};

@Injectable()
export class IncidentsService extends GenericService<IncidentEntity, string> {
  constructor(
    @InjectRepository(IncidentEntity)
    incidentsRepository: Repository<IncidentEntity>,
    @InjectRepository(IncidentLogEntity)
    private readonly logsRepository: Repository<IncidentLogEntity>,
    private readonly kongAdapter: KongAdapterService,
  ) {
    super(incidentsRepository);
  }

  async createIncident(input: CreateIncidentDto): Promise<IncidentSnapshot> {
    const incident = await this.create({
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

    return this.getIncidentSnapshot(incident.id);
  }

  async getIncidentLogs(id: string): Promise<IncidentLogEntity[]> {
    const incident = await this.findOneNullable(id);

    if (!incident) {
      throw new NotFoundException(`Incident "${id}" was not found`);
    }

    const logs = await this.logsRepository.find({
      where: { incidentId: id },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return logs;
  }

  async getIncidentSnapshot(id: string): Promise<IncidentSnapshot> {
    const incident = await this.getIncidentOrThrow(id);
    const logs = await this.getIncidentLogs(id);

    return { incident, logs };
  }

  async listIncidents(status?: IncidentStatus): Promise<IncidentEntity[]> {
    return this.genericRepository.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      withDeleted: true,
    });
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

  async acknowledge(input: IncidentActionDto): Promise<IncidentSnapshot> {
    const incident = await this.getIncidentOrThrow(input.incidentId);

    incident.status = IncidentStatus.ACKNOWLEDGED;
    incident.updatedAt = new Date();

    await this.genericRepository.save(incident);

    await this.appendLog({
      incidentId: input.incidentId,
      adminId: input.adminId,
      adminName: input.adminName,
      action: IncidentLogAction.ACKNOWLEDGED,
      details: { notes: input.notes ?? null },
    });

    return this.getIncidentSnapshot(input.incidentId);
  }

  async resolve(input: IncidentActionDto): Promise<IncidentSnapshot> {
    const incident = await this.getIncidentOrThrow(input.incidentId);

    incident.status = IncidentStatus.RESOLVED;
    incident.resolvedAt = new Date();
    incident.updatedAt = new Date();

    await this.genericRepository.save(incident);

    await this.appendLog({
      incidentId: input.incidentId,
      adminId: input.adminId,
      adminName: input.adminName,
      action: IncidentLogAction.RESOLVED,
      details: { notes: input.notes ?? null },
    });

    return this.getIncidentSnapshot(input.incidentId);
  }

  async activateFallback(
    input: ActivateFallbackDto,
  ): Promise<IncidentSnapshot> {
    const incident = await this.getIncidentOrThrow(input.incidentId);

    try {
      await this.kongAdapter.activateFallback({
        serviceName: input.serviceName,
        fallbackUrl: input.fallbackUrl,
        fallbackProviderId: input.fallbackProviderId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown Kong error';
      throw new BadRequestException(`Fallback activation failed: ${message}`);
    }

    incident.fallbackProviderId = input.fallbackProviderId;
    incident.updatedAt = new Date();

    await this.genericRepository.save(incident);

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

    return this.getIncidentSnapshot(input.incidentId);
  }

  private async getIncidentOrThrow(id: string): Promise<IncidentEntity> {
    const incident = await this.findOneNullable(id);

    if (!incident) {
      throw new NotFoundException(`Incident "${id}" was not found`);
    }

    return incident;
  }

  private async appendLog(
    log: Omit<IncidentLogEntity, 'id' | 'incident' | 'createdAt'>,
  ): Promise<IncidentLogEntity> {
    return this.logsRepository.save(this.logsRepository.create(log));
  }
}
