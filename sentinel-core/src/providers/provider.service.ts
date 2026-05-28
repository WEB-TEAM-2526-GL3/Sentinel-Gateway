import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProviderRepository } from './provider.repository';
import { KongAdapterService } from '../kong-adapter/kong-adapter.service';
import { LinkRepository } from '../links/link.repository';
import { Provider } from './provider.entity';
import { CreateGenericProviderDto } from './dto/create-generic-provider.dto';
import { CreateAIProviderDto } from './dto/create-ai-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { KongPlugin } from '../kong-adapter/kong-adapter.types';
import { RotateSecretDto } from './dto/rotate-secret.dto';
import { CryptoService } from '../common/crypto.service';
import { buildAIProxyConfig, buildAuthHeader } from './provider-plugin-config';

@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);

  constructor(
    private readonly providerRepo: ProviderRepository,
    private readonly linkRepo: LinkRepository,
    private readonly kongAdapter: KongAdapterService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cryptoService: CryptoService,
  ) {}

  // ─── Registration ──────────────────────────────────────────────

  async registerGenericProvider(
    dto: CreateGenericProviderDto,
  ): Promise<Provider> {
    const provider = await this.providerRepo.createGeneric(dto);
    try {
      await this.kongAdapter.createService(
        provider.kongServiceName,
        provider.baseUrl,
      );
    } catch (err) {
      await this.providerRepo.archive(provider.id);
      throw new Error(`Kong sync failed: ${err.message}`);
    }
    return provider;
  }

  async registerAIProvider(dto: CreateAIProviderDto): Promise<Provider> {
    const provider = await this.providerRepo.createAI(dto);
    try {
      await this.kongAdapter.createService(
        provider.kongServiceName,
        provider.baseUrl,
      );
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
    const hasActive = activeLinks.some(
      (l) => l.kind === 'primary' || l.kind === 'secondary-active',
    );
    if (hasActive)
      throw new ConflictException('Provider is still in use by active links');

    await this.providerRepo.archive(id);
    try {
      await this.kongAdapter.deleteService(provider.kongServiceName);
    } catch (err) {
      this.logger.error(
        `Failed to delete Kong service ${provider.kongServiceName}: ${err.message}`,
      );
    }
    this.eventEmitter.emit('provider.archived', { providerId: id });
  }

  // ─── Secret Rotation ─────────────────────────────────────────────

  async rotateSecret(providerId: string, dto: RotateSecretDto): Promise<void> {
    const provider = await this.providerRepo.findById(providerId);
    if (!provider) throw new NotFoundException('Provider not found');

    const encryptedKey = this.cryptoService.encrypt(dto.apiKey);
    await this.providerRepo.updateEncryptedKey(providerId, encryptedKey);

    await this.updateProviderPlugin(provider, { authKey: dto.apiKey });
    this.eventEmitter.emit('provider.secretRotated', { providerId });
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  async listProviders(): Promise<Provider[]> {
    return this.providerRepo.findAllActive();
  }

  async getProvider(id: string): Promise<Provider> {
    const provider = await this.providerRepo.findById(id);
    if (!provider) throw new NotFoundException('Provider not found');
    return provider;
  }

  private async updateProviderPlugin(
    provider: Provider,
    overrides?: {
      authKey?: string;
      aiProviderName?: string;
      aiModelName?: string;
    },
  ): Promise<void> {
    const plugins = await this.kongAdapter.listServicePlugins(
      provider.kongServiceName,
    );
    const decryptedKey =
      overrides?.authKey ??
      this.cryptoService.decrypt(provider.encryptedApiKey);

    if (provider.kind === 'llm') {
      const aiProxy = plugins.find((p: KongPlugin) => p.name === 'ai-proxy');
      if (aiProxy) {
        const config = buildAIProxyConfig(provider, decryptedKey) as any;
        if (overrides?.aiProviderName)
          config.model.provider = overrides.aiProviderName;
        if (overrides?.aiModelName) config.model.name = overrides.aiModelName;
        await this.kongAdapter.updatePlugin(aiProxy.id, config);
      }
    } else {
      const transformer = plugins.find(
        (p: KongPlugin) => p.name === 'request-transformer',
      );
      if (transformer) {
        const header = buildAuthHeader(provider, decryptedKey);
        await this.kongAdapter.updatePlugin(transformer.id, {
          add: { headers: [header] },
        });
      }
    }
  }

  // ─── Update ────────────────────────────────────────────────────

  async updateProvider(id: string, dto: UpdateProviderDto): Promise<Provider> {
    const provider = await this.providerRepo.findById(id);
    if (!provider) throw new NotFoundException('Provider not found');

    // Update display name (all providers)
    if (dto.displayName !== undefined) {
      await this.providerRepo.updateBase(id, { displayName: dto.displayName });
    }

    // Update AI-specific fields + patch plugins
    if (
      provider.kind === 'llm' &&
      (dto.aiProviderName !== undefined || dto.aiModelName !== undefined)
    ) {
      const newProviderName =
        dto.aiProviderName ?? provider.aiProvider!.aiProviderName;
      const newModelName = dto.aiModelName ?? provider.aiProvider!.aiModelName;
      await this.providerRepo.updateAIModel(id, newProviderName, newModelName);

      await this.updateProviderPlugin(provider, {
        aiProviderName: newProviderName,
        aiModelName: newModelName,
      });
    }

    // Update base URL (all providers)
    if (dto.baseUrl) {
      await this.providerRepo.updateBase(id, { baseUrl: dto.baseUrl });
      try {
        await this.kongAdapter.updateServiceUrl(
          provider.kongServiceName,
          dto.baseUrl,
        );
      } catch (err) {
        this.logger.error(`Failed to update Kong service URL: ${err.message}`);
      }
    }

    const updated = await this.providerRepo.findById(id);
    this.eventEmitter.emit('provider.updated', {
      providerId: id,
      changes: dto,
    });
    return updated!;
  }
}
