import { IncidentSeverity } from './incident-severity.enum';
import { IncidentStatus } from './incident-status.enum';

export interface CreateIncidentProps {
  id: string;
  serviceId: string;
  providerId: string;
  severity: IncidentSeverity;
  reason: string;
  status?: IncidentStatus;
  fallbackProviderId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  resolvedAt?: Date | null;
}

export class Incident {
  readonly id: string;
  readonly serviceId: string;
  readonly providerId: string;
  readonly severity: IncidentSeverity;
  readonly reason: string;
  readonly status: IncidentStatus;
  readonly fallbackProviderId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly resolvedAt: Date | null;

  private constructor(props: CreateIncidentProps) {
    this.id = props.id.trim();
    this.serviceId = props.serviceId.trim();
    this.providerId = props.providerId.trim();
    this.severity = props.severity;
    this.reason = props.reason.trim();
    this.status = props.status ?? IncidentStatus.OPEN;
    this.fallbackProviderId = props.fallbackProviderId?.trim() || null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? this.createdAt;
    this.resolvedAt = props.resolvedAt ?? null;

    this.validate();
  }

  static create(props: CreateIncidentProps): Incident {
    return new Incident(props);
  }

  acknowledge(updatedAt: Date = new Date()): Incident {
    if (this.status !== IncidentStatus.OPEN) {
      throw new Error('Only open incidents can be acknowledged');
    }

    return this.copy({
      status: IncidentStatus.ACKNOWLEDGED,
      updatedAt,
    });
  }

  resolve(updatedAt: Date = new Date()): Incident {
    if (this.status === IncidentStatus.RESOLVED) {
      throw new Error('Resolved incidents cannot be changed');
    }

    return this.copy({
      status: IncidentStatus.RESOLVED,
      updatedAt,
      resolvedAt: updatedAt,
    });
  }

  activateFallback(fallbackProviderId: string, updatedAt: Date = new Date()): Incident {
    if (this.status === IncidentStatus.RESOLVED) {
      throw new Error('Fallback cannot be activated for resolved incidents');
    }

    return this.copy({
      fallbackProviderId,
      updatedAt,
    });
  }

  private copy(overrides: Partial<CreateIncidentProps>): Incident {
    return new Incident({
      id: this.id,
      serviceId: this.serviceId,
      providerId: this.providerId,
      severity: this.severity,
      reason: this.reason,
      status: this.status,
      fallbackProviderId: this.fallbackProviderId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      resolvedAt: this.resolvedAt,
      ...overrides,
    });
  }

  private validate(): void {
    if (!this.id) {
      throw new Error('Incident id is required');
    }

    if (!this.serviceId) {
      throw new Error('Incident serviceId is required');
    }

    if (!this.providerId) {
      throw new Error('Incident providerId is required');
    }

    if (!this.reason) {
      throw new Error('Incident reason is required');
    }

    if (
      this.status === IncidentStatus.RESOLVED &&
      this.resolvedAt === null
    ) {
      throw new Error('Resolved incidents require resolvedAt');
    }
  }
}
