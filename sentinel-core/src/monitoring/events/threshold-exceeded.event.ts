import { IncidentSeverity } from '../enums/incident-severity.enum';
import { MonitoringRuleType } from '../entities/monitoring-rule.entity';

/**
 * Emitted by the Monitoring Controller when an active rule's threshold
 * is exceeded and the rule's cooldown window has passed.
 *
 * Consumer: Incident Service (owned by teammate) listens to the
 * 'monitoring.threshold.exceeded' channel and decides whether to open
 * an incident, page admins, etc. The Monitoring Controller has no
 * knowledge of incidents — it only reports anomalies.
 */
export const THRESHOLD_EXCEEDED_EVENT = 'monitoring.threshold.exceeded';

export class ThresholdExceededEvent {
  constructor(
    /** The rule that fired. */
    public readonly ruleId: string,
    public readonly ruleName: string,
    /** Kong service / upstream identifier the rule was watching. */
    public readonly serviceName: string,
    /** Provider linked to the rule, if any (Bilel does not own providers). */
    public readonly providerId: string | null,
    public readonly type: MonitoringRuleType,
    public readonly severity: IncidentSeverity,
    /** Measured value (e.g. 0.25 for 25% error rate). */
    public readonly currentValue: number,
    /** Threshold from the rule that was breached. */
    public readonly threshold: number,
    /** Human-readable reason — safe to surface in incident UI. */
    public readonly reason: string,
    /** When the anomaly was detected. */
    public readonly detectedAt: Date,
  ) {}
}
