import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LinkRepository } from './link.repository';
import { ProviderRepository } from '../providers/provider.repository';
import { ClientRepository } from '../clients/client.repository';
import { KongAdapterService } from '../kong-adapter/kong-adapter.service';
import { ClientProviderLink } from './link.entity';
import { Provider } from '../providers/provider.entity';

@Injectable()
export class LinkService {
  private readonly logger = new Logger(LinkService.name);

  constructor(
    private readonly linkRepo: LinkRepository,
    private readonly providerRepo: ProviderRepository,
    private readonly clientRepo: ClientRepository,
    private readonly kongAdapter: KongAdapterService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Linking ──────────────────────────────────────────────────────

  async linkClientToProvider(dto: {
    clientId: string;
    providerId: string;
    kind: 'primary' | 'secondary-active';
  }): Promise<ClientProviderLink> {
    const client = await this.clientRepo.findById(dto.clientId);
    if (!client) throw new NotFoundException('Client not found');

    const provider = await this.providerRepo.findById(dto.providerId);
    if (!provider) throw new NotFoundException('Provider not found');

    // If primary, ensure no other primary exists
    if (dto.kind === 'primary') {
      const existingPrimary = await this.linkRepo.findPrimary(dto.clientId);
      if (existingPrimary) throw new ConflictException('Client already has a primary link');
    }

    // Derive Kong names
    const kongServiceName = provider.serviceNameCached;
    const kongRouteName = `${client.name}-${provider.serviceNameCached}-route`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // 1. Write to DB
    const link = await this.linkRepo.save({
      clientId: dto.clientId,
      providerId: dto.providerId,
      kind: dto.kind,
      kongServiceName,
      kongRouteName,
    } as ClientProviderLink);

    try {
      // 2. Ensure Kong Service exists (ProviderService already created it, but verify)
      await this.kongAdapter.getService(kongServiceName);
    } catch {
      await this.kongAdapter.createService(kongServiceName, provider.baseUrl);
    }

    try {
      // 3. Create Kong Route
      const routePath = `/${client.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
      await this.kongAdapter.createRoute(kongServiceName, [routePath], {
        name: kongRouteName,
        stripPath: false,
      });

      // 4. Apply auth plugin
      if (provider.kind === 'llm') {
        // AI Proxy plugin
        await this.kongAdapter.addPluginToService(kongServiceName, {
          name: 'ai-proxy',
          config: this.buildAIProxyConfig(provider),
        });
      } else {
        // Request transformer plugin for generic providers
        const authHeader = this.buildAuthHeader(provider);
        await this.kongAdapter.addPluginToService(kongServiceName, {
          name: 'request-transformer',
          config: { add: { headers: [authHeader] } },
        });
      }

      // 5. If primary, update client
      if (dto.kind === 'primary') {
        await this.clientRepo.save({ ...client, primaryLinkId: link.id, status: 'active' });
      }
    } catch (err) {
      // Rollback
      await this.linkRepo.archive(link.id);
      throw new Error(`Kong sync failed: ${err.message}`);
    }

    this.eventEmitter.emit('link.created', { linkId: link.id, clientId: dto.clientId, providerId: dto.providerId, kind: dto.kind });
    return link;
  }

  // ─── Selection / Switching ───────────────────────────────────────

  async selectLink(clientId: string, newLinkId: string): Promise<void> {
    const client = await this.clientRepo.findById(clientId);
    if (!client) throw new NotFoundException('Client not found');

    const newLink = await this.linkRepo.findById(newLinkId);
    if (!newLink || newLink.clientId !== clientId) throw new NotFoundException('Link not found');
    if (newLink.kind === 'secondary-inactive' || newLink.kind === 'archived') {
      throw new ConflictException('Cannot select an inactive or archived link');
    }

    const oldPrimary = await this.linkRepo.findPrimary(clientId);
    const oldLinkId = oldPrimary?.id ?? null;

    // 1. Demote old primary (if any)
    if (oldPrimary) {
      await this.linkRepo.save({ ...oldPrimary, kind: 'secondary-active' });
    }

    // 2. Promote new link
    await this.linkRepo.save({ ...newLink, kind: 'primary' });

    // 3. Update client
    await this.clientRepo.save({ ...client, primaryLinkId: newLinkId, status: 'active' });

    // 4. Update Kong route to point to new service
    try {
      const routeId = oldPrimary?.kongRouteName ?? newLink.kongRouteName;
      await this.kongAdapter.updateRouteService(routeId!, newLink.kongServiceName!);
    } catch (err) {
      this.logger.error(`Failed to update Kong route: ${err.message}`);
    }

    this.eventEmitter.emit('link.primaryChanged', {
      clientId,
      oldLinkId,
      newLinkId,
      reason: 'manual',
    });
  }

  // ─── Failure Handling ────────────────────────────────────────────

  async handleLinkFailure(
    clientId: string,
    failedLinkId: string,
    reason: 'dead' | 'limit',
    incidentId: string,
  ): Promise<void> {
    const failedLink = await this.linkRepo.findById(failedLinkId);
    if (!failedLink) throw new NotFoundException('Link not found');

    // 1. Deactivate failed link
    await this.linkRepo.save({ ...failedLink, kind: 'secondary-inactive', incidentId });

    // 2. Emit failure event
    this.eventEmitter.emit('link.failed', { clientId, linkId: failedLinkId, reason, incidentId });

    // 3. Search for an active secondary to failover to
    const activeSecondaries = await this.linkRepo.findActiveSecondaries(clientId);
    const failoverTarget = activeSecondaries.length > 0 ? activeSecondaries[0] : null;

    if (failoverTarget) {
      // Promote the found secondary to primary
      await this.selectLink(clientId, failoverTarget.id);
      this.eventEmitter.emit('link.primaryChanged', {
        clientId,
        oldLinkId: failedLinkId,
        newLinkId: failoverTarget.id,
        reason: 'failover',
      });
    } else {
      // No failover available — client becomes blocked
      const client = await this.clientRepo.findById(clientId);
      if (client) {
        const newStatus = reason === 'dead' ? 'dead' : 'limit';
        await this.clientRepo.save({ ...client, primaryLinkId: null, status: newStatus });

        // Point route to bad service using the cached kongRouteName from the failed link
        const badServiceName = reason === 'dead' ? 'provider-dead-svc' : 'limit-exceeded-svc';
        try {
          await this.kongAdapter.updateRouteService(failedLink.kongRouteName!, badServiceName);
        } catch (err) {
          this.logger.error(`Failed to point route to bad service: ${err.message}`);
        }
      }
    }
  }

  async activateLink(linkId: string): Promise<void> {
    const link = await this.linkRepo.findById(linkId);
    if (!link) throw new NotFoundException('Link not found');
    if (link.kind !== 'secondary-inactive') throw new ConflictException('Only inactive links can be activated');

    // Clear the incident and make it active
    await this.linkRepo.save({ ...link, kind: 'secondary-active', incidentId: null });
    this.eventEmitter.emit('link.activated', { linkId, clientId: link.clientId, providerId: link.providerId });
  }

  // ─── Archive ──────────────────────────────────────────────────────

  async archiveLink(linkId: string): Promise<void> {
    const link = await this.linkRepo.findById(linkId);
    if (!link) throw new NotFoundException('Link not found');
    if (link.kind === 'primary') throw new ConflictException('Cannot archive primary link — switch away first');

    await this.linkRepo.archive(linkId);
    try {
      await this.kongAdapter.deleteRoute(link.kongServiceName!, link.kongRouteName!);
    } catch (err) {
      this.logger.error(`Failed to delete Kong route: ${err.message}`);
    }
    this.eventEmitter.emit('link.archived', { linkId, clientId: link.clientId, providerId: link.providerId });
  }

  // ─── Queries ──────────────────────────────────────────────────────

  async getClientStatus(clientId: string): Promise<{
    selectedLink: any | null;
    secondaries: any[];
    blocked: boolean;
    blockReason?: string;
  }> {
    const client = await this.clientRepo.findById(clientId);
    if (!client) throw new NotFoundException('Client not found');

    const primary = await this.linkRepo.findPrimary(clientId);
    const allLinks = await this.linkRepo.findByClient(clientId);
    const secondaries = allLinks.filter(l => l.kind !== 'primary' && l.kind !== 'archived');

    return {
      selectedLink: primary ? {
        linkId: primary.id,
        providerId: primary.providerId,
        providerName: primary.kongServiceName,
        status: 'active',
      } : null,
      secondaries: secondaries.map(l => ({
        linkId: l.id,
        providerId: l.providerId,
        providerName: l.kongServiceName,
        status: l.kind === 'secondary-active' ? 'active' : 'inactive',
        incidentId: l.incidentId,
      })),
      blocked: client.status === 'dead' || client.status === 'limit',
      blockReason: client.status === 'dead' ? 'dead' : client.status === 'limit' ? 'limit' : undefined,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private buildAuthHeader(provider: Provider): string {
    const auth = provider.auth;
    switch (auth.method) {
      case 'bearer': return `Authorization: Bearer ${auth.encryptedApiKey}`;
      case 'apiKey': return `${auth.headerName}: ${auth.encryptedApiKey}`;
      default: return '';
    }
  }

  private buildAIProxyConfig(provider: Provider): Record<string, unknown> {
    return {
      route_type: 'llm/v1/chat',
      auth: {
        param_name: 'key',
        param_value: provider.encryptedApiKey,
        param_location: 'query',
      },
      model: {
        provider: provider.aiProvider?.name ?? provider.serviceNameCached,
        name: provider.aiProvider?.modelName ?? '',
      },
      logging: { log_statistics: true },
    };
  }
}