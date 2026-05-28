import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Provider } from './provider.entity';
import { AIProvider } from './ai-provider.entity';
import { sanitizeKongName } from '../common/sanitize';

@Injectable()
export class ProviderRepository {
  constructor(
    @InjectRepository(Provider)
    private readonly baseRepo: Repository<Provider>,
    @InjectRepository(AIProvider)
    private readonly aiRepo: Repository<AIProvider>,
  ) {}

  // ─── Finders ──────────────────────────────────────────────────

  async findById(id: string): Promise<Provider | null> {
    return this.baseRepo.findOne({ where: { id }, relations: ['aiProvider'] });
  }

  async findByKongServiceName(name: string): Promise<Provider | null> {
    return this.baseRepo.findOne({
      where: { kongServiceName: name },
      relations: ['aiProvider'],
    });
  }

  async findAllActive(): Promise<Provider[]> {
    return this.baseRepo.find({
      where: { isArchived: false },
      relations: ['aiProvider'],
    });
  }

  // ─── Creation ─────────────────────────────────────────────────

  async createGeneric(dto: {
    kongServiceName: string;
    displayName: string;
    baseUrl: string;
    authMethod: 'bearer' | 'apiKey' | 'query';
    authHeaderName?: string;
    authParamName?: string;
    encryptedApiKey: string;
  }): Promise<Provider> {
    const provider = this.baseRepo.create({
      kind: 'generic',
      kongServiceName: sanitizeKongName(dto.kongServiceName),
      displayName: dto.displayName,
      baseUrl: dto.baseUrl,
      authMethod: dto.authMethod,
      authHeaderName: dto.authHeaderName ?? null,
      authParamName: dto.authParamName ?? null,
      encryptedApiKey: dto.encryptedApiKey,
    });
    return this.baseRepo.save(provider);
  }

  async createAI(dto: {
    kongServiceName: string;
    displayName: string;
    aiProviderName: string;
    aiModelName: string;
    baseUrl: string;
    authMethod: 'bearer' | 'apiKey' | 'query';
    authHeaderName?: string;
    authParamName?: string;
    encryptedApiKey: string;
  }): Promise<Provider> {
    const provider = this.baseRepo.create({
      kind: 'llm',
      kongServiceName: sanitizeKongName(dto.kongServiceName),
      displayName: dto.displayName,
      baseUrl: dto.baseUrl,
      authMethod: dto.authMethod,
      authHeaderName: dto.authHeaderName ?? null,
      authParamName: dto.authParamName ?? null,
      encryptedApiKey: dto.encryptedApiKey,
    });
    const saved = await this.baseRepo.save(provider);

    const ai = this.aiRepo.create({
      provider: saved,
      providerId: saved.id,
      aiProviderName: dto.aiProviderName,
      aiModelName: dto.aiModelName,
    });
    await this.aiRepo.save(ai);

    return (await this.findById(saved.id)) as Provider;
  }

  // ─── Updates ─────────────────────────────────────────────────

  async updateBase(
    id: string,
    changes: Partial<
      Pick<
        Provider,
        | 'baseUrl'
        | 'displayName'
        | 'isArchived'
        | 'authMethod'
        | 'authHeaderName'
        | 'authParamName'
        | 'encryptedApiKey'
      >
    >,
  ): Promise<Provider> {
    await this.baseRepo.update(id, changes);
    return (await this.findById(id)) as Provider;
  }

  async updateAIModel(
    id: string,
    aiProviderName: string,
    aiModelName: string,
  ): Promise<Provider> {
    await this.aiRepo.update(
      { providerId: id },
      { aiProviderName, aiModelName },
    );
    return (await this.findById(id)) as Provider;
  }

  async updateEncryptedKey(
    id: string,
    encryptedApiKey: string,
  ): Promise<Provider> {
    await this.baseRepo.update(id, { encryptedApiKey });
    return (await this.findById(id)) as Provider;
  }
  // ─── Archive ─────────────────────────────────────────────────

  async archive(id: string): Promise<void> {
    await this.baseRepo.update(id, { isArchived: true });
  }
}
