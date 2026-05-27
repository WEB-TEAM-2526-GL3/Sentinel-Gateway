import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Provider } from './provider.entity';
import { GenericProvider } from './generic-provider.entity';
import { AIProvider } from './ai-provider.entity';

@Injectable()
export class ProviderRepository {
  constructor(
    @InjectRepository(Provider)
    private readonly baseRepo: Repository<Provider>,
    @InjectRepository(GenericProvider)
    private readonly genericRepo: Repository<GenericProvider>,
    @InjectRepository(AIProvider)
    private readonly aiRepo: Repository<AIProvider>,
  ) {}

  // ── Finders ──────────────────────────────────────────────────────

  async findById(id: string): Promise<Provider | null> {
    return this.baseRepo.findOne({
      where: { id },
      relations: ['genericProvider', 'aiProvider'],
    });
  }

  async findByServiceName(serviceName: string): Promise<Provider | null> {
    return this.baseRepo.findOne({
      where: { serviceNameCached: serviceName },
      relations: ['genericProvider', 'aiProvider'],
    });
  }

  async findAllActive(): Promise<Provider[]> {
    return this.baseRepo.find({
      where: { isArchived: false },
      relations: ['genericProvider', 'aiProvider'],
    });
  }

  // ── Creation ─────────────────────────────────────────────────────

  async createGeneric(data: {
    name: string;
    baseUrl: string;
    authMethod: 'bearer' | 'apiKey' | 'query';
    authHeaderName?: string;
    authParamName?: string;
    encryptedApiKey: string;
  }): Promise<Provider> {
    const serviceName = this.sanitize(data.name);
    const provider = this.baseRepo.create({
      kind: 'generic',
      serviceNameCached: serviceName,
      baseUrl: data.baseUrl,
      authMethod: data.authMethod,
      authHeaderName: data.authHeaderName ?? null,
      authParamName: data.authParamName ?? null,
      encryptedApiKey: data.encryptedApiKey,
    });
    const saved = await this.baseRepo.save(provider);

    const generic = this.genericRepo.create({
      provider: saved,
      providerId: saved.id,
      name: data.name,
    });
    await this.genericRepo.save(generic);

    return (await this.findById(saved.id)!) as Provider;
  }

  async createAI(data: {
    name: string;
    modelName: string;
    baseUrl: string;
    authMethod: 'bearer' | 'apiKey' | 'query';
    authHeaderName?: string;
    authParamName?: string;
    encryptedApiKey: string;
  }): Promise<Provider> {
    const serviceName = this.sanitize(`${data.name}-${data.modelName}`);
    const provider = this.baseRepo.create({
      kind: 'llm',
      serviceNameCached: serviceName,
      baseUrl: data.baseUrl,
      authMethod: data.authMethod,
      authHeaderName: data.authHeaderName ?? null,
      authParamName: data.authParamName ?? null,
      encryptedApiKey: data.encryptedApiKey,
    });
    const saved = await this.baseRepo.save(provider);

    const ai = this.aiRepo.create({
      provider: saved,
      providerId: saved.id,
      name: data.name,
      modelName: data.modelName,
    });
    await this.aiRepo.save(ai);

    return (await this.findById(saved.id)!) as Provider;
  }

  // ── Updates (scoped) ─────────────────────────────────────────────

  async updateBase(
    id: string,
    changes: Partial<
      Pick<
        Provider,
        | 'baseUrl'
        | 'isArchived'
        | 'authMethod'
        | 'authHeaderName'
        | 'authParamName'
        | 'encryptedApiKey'
      >
    >,
  ): Promise<Provider> {
    await this.baseRepo.update(id, changes);
    return (await this.findById(id)!) as Provider;
  }

  async updateGenericName(id: string, newName: string): Promise<Provider> {
    const p = await this.baseRepo.findOne({
      where: { id },
      relations: ['genericProvider'],
    });
    if (!p || p.kind !== 'generic') throw new Error('Not a generic provider');
    await this.genericRepo.update({ providerId: id }, { name: newName });
    const newSvc = this.sanitize(newName);
    await this.baseRepo.update(id, { serviceNameCached: newSvc });
    return (await this.findById(id)!) as Provider;
  }

  async updateAIModelName(id: string, newModelName: string): Promise<Provider> {
    const p = await this.baseRepo.findOne({
      where: { id },
      relations: ['aiProvider'],
    });
    if (!p || p.kind !== 'llm') throw new Error('Not an AI provider');
    await this.aiRepo.update({ providerId: id }, { modelName: newModelName });
    const newSvc = this.sanitize(`${p.aiProvider!.name}-${newModelName}`);
    await this.baseRepo.update(id, { serviceNameCached: newSvc });
    return (await this.findById(id)!) as Provider;
  }

  // ── Archive ──────────────────────────────────────────────────────

  async archive(id: string): Promise<void> {
    await this.baseRepo.update(id, { isArchived: true });
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private sanitize(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
