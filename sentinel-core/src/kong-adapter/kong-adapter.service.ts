import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { firstValueFrom } from 'rxjs'
import { KONG_ADMIN_URL } from './kong-adapter.constants'
import type {
  KongService,
  KongRoute,
  KongConsumer,
  KongApiKey,
  KongPlugin,
  KongNodeInfo,
} from './kong-adapter.types'

@Injectable()
export class KongAdapterService {
  private readonly logger = new Logger(KongAdapterService.name)
  private readonly baseUrl = KONG_ADMIN_URL

  constructor(private readonly http: HttpService) {}

  // ─── Setup ────────────────────────────────────────────────────────

  async init(): Promise<void> {
    this.logger.log('Initializing Kong adapter...')
    const existing = await this.listGlobalPlugins()
    const hasKeyAuth = existing.some((p) => p.name === 'key-auth')
    const hasPrometheus = existing.some((p) => p.name === 'prometheus')

    if (!hasKeyAuth) {
      this.logger.log('Enabling key-auth plugin globally...')
      await this.createPlugin({ name: 'key-auth', config: {} })
    }
    if (!hasPrometheus) {
      this.logger.log('Enabling prometheus plugin globally...')
      await this.createPlugin({ name: 'prometheus', config: {} })
    }
    this.logger.log('Kong adapter initialized')
  }

  // ─── Services ─────────────────────────────────────────────────────

  async createService(name: string, url: string): Promise<KongService> {
    const { data } = await firstValueFrom(
      this.http.post<KongService>(`${this.baseUrl}/services`, { name, url }),
    )
    return data
  }

  async getService(name: string): Promise<KongService> {
    const { data } = await firstValueFrom(
      this.http.get<KongService>(`${this.baseUrl}/services/${name}`),
    )
    return data
  }

  async listServices(): Promise<KongService[]> {
    const { data } = await firstValueFrom(
      this.http.get<{ data: KongService[] }>(`${this.baseUrl}/services`),
    )
    return data.data
  }

  async deleteService(name: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.baseUrl}/services/${name}`),
    )
  }

  async updateServiceUrl(name: string, newUrl: string): Promise<void> {
    await firstValueFrom(
      this.http.patch(`${this.baseUrl}/services/${name}`, { url: newUrl }),
    )
  }

  // ─── Routes ───────────────────────────────────────────────────────

  async createRoute(
    serviceName: string,
    paths: string[],
    options?: {
      stripPath?: boolean
      methods?: string[]
      hosts?: string[]
      name?: string
    },
  ): Promise<KongRoute> {
    const { data } = await firstValueFrom(
      this.http.post<KongRoute>(
        `${this.baseUrl}/services/${serviceName}/routes`,
        {
          name: options?.name,
          paths,
          strip_path: options?.stripPath ?? true,
          methods: options?.methods,
          hosts: options?.hosts,
          protocols: ['http', 'https'],
        },
      ),
    )
    return data
  }

  // ─── Auth ─────────────────────────────────────────────────────────

  async createConsumer(username: string): Promise<KongConsumer> {
    const { data } = await firstValueFrom(
      this.http.post<KongConsumer>(`${this.baseUrl}/consumers`, { username }),
    )
    return data
  }

  async createApiKey(consumerUsername: string, key?: string): Promise<KongApiKey> {
    const body = key ? { key } : {}
    const { data } = await firstValueFrom(
      this.http.post<KongApiKey>(
        `${this.baseUrl}/consumers/${consumerUsername}/key-auth`,
        body,
      ),
    )
    return data
  }

  async enableKeyAuth(serviceName: string): Promise<void> {
    const exists = await this.findPluginOnService(serviceName, 'key-auth')
    if (exists) return

    await firstValueFrom(
      this.http.post(`${this.baseUrl}/plugins`, {
        name: 'key-auth',
        service: { name: serviceName },
        config: { key_names: ['apikey'] },
      }),
    )
  }

  // ─── Health ───────────────────────────────────────────────────────

  async ping(): Promise<KongNodeInfo> {
    const { data } = await firstValueFrom(
      this.http.get<KongNodeInfo>(`${this.baseUrl}/`),
    )
    return data
  }

  // ─── Internal ─────────────────────────────────────────────────────

  private async listGlobalPlugins(): Promise<KongPlugin[]> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<{ data: KongPlugin[] }>(`${this.baseUrl}/plugins`, {
          params: { size: 100 },
        }),
      )
      return data.data.filter((p) => !p.service && !p.route && !p.consumer)
    } catch {
      return []
    }
  }

  private async findPluginOnService(
    serviceName: string,
    pluginName: string,
  ): Promise<KongPlugin | null> {
    try {
      const service = await this.getService(serviceName)
      const { data } = await firstValueFrom(
        this.http.get<{ data: KongPlugin[] }>(`${this.baseUrl}/plugins`, {
          params: { size: 100 },
        }),
      )
      return (
        data.data.find(
          (p) => p.name === pluginName && p.service?.id === service.id,
        ) ?? null
      )
    } catch {
      return null
    }
  }

  private async createPlugin(config: {
    name: string
    config?: Record<string, unknown>
  }): Promise<KongPlugin> {
    const { data } = await firstValueFrom(
      this.http.post<KongPlugin>(`${this.baseUrl}/plugins`, config),
    )
    return data
  }
}
