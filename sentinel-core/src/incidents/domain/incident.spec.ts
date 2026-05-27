import { Incident } from './incident';
import { IncidentSeverity } from './incident-severity.enum';
import { IncidentStatus } from './incident-status.enum';

const baseIncident = () =>
  Incident.create({
    id: '11111111-1111-4111-8111-111111111111',
    serviceId: '22222222-2222-4222-8222-222222222222',
    providerId: '33333333-3333-4333-8333-333333333333',
    severity: IncidentSeverity.HIGH,
    reason: 'OpenAI timeout spike',
  });

describe('Incident', () => {
  it('creates open incidents by default', () => {
    const incident = baseIncident();

    expect(incident.status).toBe(IncidentStatus.OPEN);
    expect(incident.fallbackProviderId).toBeNull();
    expect(incident.resolvedAt).toBeNull();
  });

  it('acknowledges only open incidents', () => {
    const acknowledged = baseIncident().acknowledge();

    expect(acknowledged.status).toBe(IncidentStatus.ACKNOWLEDGED);
    expect(() => acknowledged.acknowledge()).toThrow(
      'Only open incidents can be acknowledged',
    );
  });

  it('resolves open and acknowledged incidents', () => {
    const resolvedFromOpen = baseIncident().resolve();
    const resolvedFromAcknowledged = baseIncident().acknowledge().resolve();

    expect(resolvedFromOpen.status).toBe(IncidentStatus.RESOLVED);
    expect(resolvedFromOpen.resolvedAt).toBeInstanceOf(Date);
    expect(resolvedFromAcknowledged.status).toBe(IncidentStatus.RESOLVED);
  });

  it('prevents changes after resolution', () => {
    const resolved = baseIncident().resolve();

    expect(() => resolved.resolve()).toThrow(
      'Resolved incidents cannot be changed',
    );
    expect(() =>
      resolved.activateFallback('44444444-4444-4444-8444-444444444444'),
    ).toThrow('Fallback cannot be activated for resolved incidents');
  });

  it('activates fallback while incident is unresolved', () => {
    const incident = baseIncident().acknowledge();
    const updated = incident.activateFallback(
      '44444444-4444-4444-8444-444444444444',
    );

    expect(updated.fallbackProviderId).toBe(
      '44444444-4444-4444-8444-444444444444',
    );
    expect(updated.status).toBe(IncidentStatus.ACKNOWLEDGED);
  });
});
