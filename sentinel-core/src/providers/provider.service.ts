import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProviderRepository } from './provider.repository';
import { KongAdapterService } from '../kong-adapter/kong-adapter.service';
import { LinkRepository } from '../links/link.repository';
import { Provider } from './provider.entity';

@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);

  constructor(
    private readonly providerRepo: ProviderRepository,
    private readonly linkRepo: LinkRepository,
    private readonly kongAdapter: KongAdapterService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Registration ─────────────────────────────────────────────────

  async registerGenericProvider(dto: {
    name: string;
    baseUrl: string;
    authMethod: 'bearer' | 'apiKey' | 'query';
    authHeaderName?: string;
    authParamName?: string;
    encryptedApiKey: string;
  }): Promise<Provider> {
    const provider = await this.providerRepo.createGeneric(dto);
    try {
      await this.kongAdapter.createService(provider.serviceNameCached, provider.baseUrl);
    } catch (err) {
      await this.providerRepo.archive(provider.id);
      throw new Error(`Kong sync failed: ${err.message}`);
    }
    return provider;
  }

  async registerAIProvider(dto: {
    name: string;
    modelName: string;
    baseUrl: string;
    authMethod: 'bearer' | 'apiKey' | 'query';
    authHeaderName?: string;
    authParamName?: string;
    encryptedApiKey: string;
  }): Promise<Provider> {
    const provider = await this.providerRepo.createAI(dto);
    try {
      await this.kongAdapter.createService(provider.serviceNameCached, provider.baseUrl);
    } catch (err) {
      await this.providerRepo.archive(provider.id);
      throw new Error(`Kong sync failed: ${err.message}`);
    }
    return provider;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  async archiveProvider(id: string): Promise<void> {
    const provider = await this.providerRepo.findById(id);
    if (!provider) throw new NotFoundException('Provider not found');

    const activeLinks = await this.linkRepo.findByProvider(id);
    const hasActive = activeLinks.some(l => l.kind === 'primary' || l.kind === 'secondary-active');
    if (hasActive) throw new ConflictException('Provider is still in use by active links');

    await this.providerRepo.archive(id);
    try {
      await this.kongAdapter.deleteService(provider.serviceNameCached);
    } catch (err) {
      this.logger.error(`Failed to delete Kong service ${provider.serviceNameCached}: ${err.message}`);
    }
    this.eventEmitter.emit('provider.archived', { providerId: id });
  }

  // ─── Secret Rotation ─────────────────────────────────────────────

  async rotateSecret(providerId: string, newEncryptedKey: string): Promise<void> {
    const provider = await this.providerRepo.findById(providerId);
    if (!provider) throw new NotFoundException('Provider not found');

    await this.providerRepo.updateBase(providerId, { encryptedApiKey: newEncryptedKey });

    const links = await this.linkRepo.findByProvider(providerId);
    for (const link of links) {
      try {
        if (provider.kind === 'llm') {
          const plugins = await this.kongAdapter.listServicePlugins(link.kongServiceName!);
          const aiProxy = plugins.find(p => p.name === 'ai-proxy');
          if (aiProxy) {
            await this.kongAdapter.updatePlugin(aiProxy.id, {
              auth: { header_name: 'Authorization', header_value: `Bearer ${newEncryptedKey}` },
            });
          }
        } else {
          const plugins = await this.kongAdapter.listServicePlugins(link.kongServiceName!);
          const transformer = plugins.find(p => p.name === 'request-transformer');
          if (transformer) {
            const newHeader = this.buildAuthHeader(provider, newEncryptedKey);
            await this.kongAdapter.updatePlugin(transformer.id, { add: { headers: [newHeader] } });
          }
        }
      } catch (err) {
        this.logger.error(`Failed to rotate secret for link ${link.id}: ${err.message}`);
      }
    }

    this.eventEmitter.emit('provider.secretRotated', { providerId });
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private buildAuthHeader(provider: Provider, encryptedKey: string): string {
    const auth = provider.auth;
    switch (auth.method) {
      case 'bearer': return `${auth.headerName}: Bearer ${encryptedKey}`;
      case 'apiKey': return `${auth.headerName}: ${encryptedKey}`;
      default: return '';
    }
  }
}