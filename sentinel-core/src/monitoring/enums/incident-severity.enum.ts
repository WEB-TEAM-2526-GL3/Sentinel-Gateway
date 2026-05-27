/**
 * Severity tag attached to monitoring rules.
 *
 * Note: this enum lives in the monitoring module so it can run standalone.
 * The Incident Service (owned by another teammate) defines its own
 * IncidentSeverity. The two are kept value-compatible (same string values)
 * so the emitted event payload can be consumed without translation.
 */
export enum IncidentSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}
