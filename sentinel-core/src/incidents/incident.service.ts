import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IncidentRepository } from './incident.repository';
import { FailoverService } from './failover.service';
import { LinkService } from '../links/link.service';
import { LinkRepository } from '../links/link.repository';
import { Incident } from './incident.entity';

@Injectable()
export class IncidentService {
  private readonly logger = new Logger(IncidentService.name);

  constructor(
    private readonly incidentRepo: IncidentRepository,
    private readonly failoverService: FailoverService,
    private readonly linkService: LinkService,
    private readonly linkRepo: LinkRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    // Health failures – affects ALL clients using this provider
    this.eventEmitter.on(
      'health.changed',
      async (event: { providerId: string; healthy: boolean }) => {
        if (event.healthy) return; // only care about unhealthy

        // Find all links where this provider is primary
        const allLinks = await this.linkRepo.findByProvider(event.providerId);
        const primaryLinks = allLinks.filter((l) => l.kind === 'primary');

        for (const link of primaryLinks) {
          // Create an incident per affected client
          const incident = await this.incidentRepo.create({
            reason: 'dead',
            linkId: link.id,
            cachedClientId: link.clientId,
            cachedProviderId: event.providerId,
          });

          this.eventEmitter.emit('incident.created', incident);

          // Check failover rule
          const shouldSwitch = await this.failoverService.shouldFailover(
            link.clientId,
            'dead',
          );

          if (shouldSwitch) {
            // linkService.handleLinkFailure will search for an active secondary
            await this.linkService.handleLinkFailure(
              link.clientId,
              link.id,
              'dead',
              incident.id,
            );
          } else {
            // No failover – just deactivate and block
            await this.linkService.handleLinkFailure(
              link.clientId,
              link.id,
              'dead',
              incident.id,
            );
          }
        }
      },
    );

    // Limit exceeded – affects a single client-provider pair
    this.eventEmitter.on(
      'limit.exceeded',
      async (event: {
        clientId: string;
        providerId: string;
        limitId: string;
        limitType: 'request' | 'token';
        current: number;
        max: number;
      }) => {
        if (event.clientId === 'global') return; // token limits not handled per-client yet

        // Find the primary link for this client+provider
        const primaryLink = await this.linkRepo.findPrimary(event.clientId);
        if (!primaryLink || primaryLink.providerId !== event.providerId) {
          // Limit exceeded on a secondary? Just mark it inactive, no failover
          const secondary = (
            await this.linkRepo.findByClient(event.clientId)
          ).find(
            (l) =>
              l.providerId === event.providerId &&
              l.kind === 'secondary-active',
          );
          if (secondary) {
            const incident = await this.incidentRepo.create({
              reason:
                event.limitType === 'request' ? 'requestLimit' : 'tokenLimit',
              linkId: secondary.id,
              cachedClientId: event.clientId,
              cachedProviderId: event.providerId,
              limitRuleId: event.limitId,
            });
            await this.linkRepo.save({
              ...secondary,
              kind: 'secondary-inactive',
              incidentId: incident.id,
            });
            this.eventEmitter.emit('incident.created', incident);
          }
          return;
        }

        // Primary link limit exceeded
        const incident = await this.incidentRepo.create({
          reason: event.limitType === 'request' ? 'requestLimit' : 'tokenLimit',
          linkId: primaryLink.id,
          cachedClientId: event.clientId,
          cachedProviderId: event.providerId,
          limitRuleId: event.limitId,
        });

        this.eventEmitter.emit('incident.created', incident);

        const shouldSwitch = await this.failoverService.shouldFailover(
          event.clientId,
          'limit',
        );

        await this.linkService.handleLinkFailure(
          event.clientId,
          primaryLink.id,
          'limit',
          incident.id,
        );
      },
    );
  }

  async getIncidents(clientId: string): Promise<Incident[]> {
    return this.incidentRepo.findByClient(clientId);
  }
}
