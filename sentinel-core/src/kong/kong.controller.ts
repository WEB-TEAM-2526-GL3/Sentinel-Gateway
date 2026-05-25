import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Body,
} from '@nestjs/common';
import { AxiosError } from 'axios';
import { KongAdapterService } from '../kong-adapter/kong-adapter.service';
import type {
  KongNodeInfo,
  KongRoute,
  KongService,
} from '../kong-adapter/kong-adapter.types';
import { CreateKongServiceDto } from './dto/create-kong-service.dto';
import { UpdateKongServiceDto } from './dto/update-kong-service.dto';
import { CreateKongRouteDto } from './dto/create-kong-route.dto';
import { UpdateKongRouteDto } from './dto/update-kong-route.dto';
import { CreateKongPluginDto } from './dto/create-kong-plugin.dto';
import type { KongPlugin } from '../kong-adapter/kong-adapter.types';

@Controller('kong')
export class KongController {
  constructor(private readonly kongAdapter: KongAdapterService) {}

  @Get('health')
  async health(): Promise<KongNodeInfo> {
    return this.callKong(() => this.kongAdapter.ping());
  }

  @Post('services')
  async createService(
    @Body() body: CreateKongServiceDto,
  ): Promise<{ service: KongService; route?: KongRoute }> {
    const service = await this.callKong(() =>
      this.kongAdapter.createService(body.name, body.url),
    );

    if (!body.route) {
      return { service };
    }

    const route = await this.callKong(() =>
      this.kongAdapter.createRoute(body.name, body.route!.paths, {
        name: body.route!.name,
        stripPath: body.route!.stripPath,
        methods: body.route!.methods,
        hosts: body.route!.hosts,
      }),
    );

    return { service, route };
  }

  @Get('services')
  async listServices(): Promise<{ data: KongService[] }> {
    const services = await this.callKong(() => this.kongAdapter.listServices());

    return { data: services };
  }

  @Get('services/:name')
  async getService(@Param('name') name: string): Promise<KongService> {
    return this.callKong(() => this.kongAdapter.getService(name));
  }

  @Patch('services/:name')
  async updateService(
    @Param('name') name: string,
    @Body() body: UpdateKongServiceDto,
  ): Promise<KongService> {
    await this.callKong(() =>
      this.kongAdapter.updateServiceUrl(name, body.url),
    );

    return this.callKong(() => this.kongAdapter.getService(name));
  }

  @Delete('services/:name')
  async deleteService(
    @Param('name') name: string,
  ): Promise<{ deleted: boolean; service: string }> {
    await this.callKong(() => this.kongAdapter.deleteService(name));

    return {
      deleted: true,
      service: name,
    };
  }

  @Post('services/:serviceName/routes')
  async createRoute(
    @Param('serviceName') serviceName: string,
    @Body() body: CreateKongRouteDto,
  ): Promise<KongRoute> {
    return this.callKong(() =>
      this.kongAdapter.createRoute(serviceName, body.paths, {
        name: body.name,
        stripPath: body.stripPath,
        methods: body.methods,
        hosts: body.hosts,
      }),
    );
  }

  @Get('services/:serviceName/routes')
  async listServiceRoutes(
    @Param('serviceName') serviceName: string,
  ): Promise<{ data: KongRoute[] }> {
    const routes = await this.callKong(() =>
      this.kongAdapter.listRoutes(serviceName),
    );

    return { data: routes };
  }

  @Get('routes')
  async listRoutes(): Promise<{ data: KongRoute[] }> {
    const routes = await this.callKong(() => this.kongAdapter.listRoutes());

    return { data: routes };
  }

  @Get('routes/:routeIdOrName')
  async getRoute(
    @Param('routeIdOrName') routeIdOrName: string,
  ): Promise<KongRoute> {
    return this.callKong(() => this.kongAdapter.getRoute(routeIdOrName));
  }

  @Patch('routes/:routeIdOrName')
  async updateRoute(
    @Param('routeIdOrName') routeIdOrName: string,
    @Body() body: UpdateKongRouteDto,
  ): Promise<KongRoute> {
    return this.callKong(() =>
      this.kongAdapter.updateRoute(routeIdOrName, {
        name: body.name,
        paths: body.paths,
        stripPath: body.stripPath,
        methods: body.methods,
        hosts: body.hosts,
      }),
    );
  }

  @Delete('routes/:routeIdOrName')
  async deleteRoute(
    @Param('routeIdOrName') routeIdOrName: string,
  ): Promise<{ deleted: boolean; route: string }> {
    await this.callKong(() => this.kongAdapter.deleteRoute(routeIdOrName));

    return {
      deleted: true,
      route: routeIdOrName,
    };
  }

  private async callKong<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      const axiosError = error as AxiosError;

      if (axiosError.response) {
        throw new HttpException(
          axiosError.response.data ?? { message: axiosError.message },
          axiosError.response.status,
        );
      }

      if (axiosError.code === 'ECONNREFUSED') {
        throw new HttpException(
          {
            message:
              'Kong Admin API is unreachable. Make sure Kong is running on http://localhost:8001',
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      throw new HttpException(
        {
          message: 'Unexpected Kong error',
          error: axiosError.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // adding plugins controller part:
  @Post('services/:serviceName/plugins')
  async addPluginToService(
    @Param('serviceName') serviceName: string,
    @Body() body: CreateKongPluginDto,
  ): Promise<{
    created: boolean;
    service: string;
    plugin: {
      id: string;
      name: string;
      enabled: boolean;
    };
  }> {
    const plugin = await this.callKong(() =>
      this.kongAdapter.addPluginToService(serviceName, {
        name: body.name,
        config: body.config,
      }),
    );

    return {
      created: true,
      service: serviceName,
      plugin: {
        id: plugin.id,
        name: plugin.name,
        enabled: plugin.enabled,
      },
    };
  }

  @Get('services/:serviceName/plugins')
  async listServicePlugins(
    @Param('serviceName') serviceName: string,
  ): Promise<{ data: KongPlugin[] }> {
    const plugins = await this.callKong(() =>
      this.kongAdapter.listPlugins(serviceName),
    );

    return { data: plugins };
  }

  @Get('plugins')
  async listPlugins(): Promise<{ data: KongPlugin[] }> {
    const plugins = await this.callKong(() => this.kongAdapter.listPlugins());

    return { data: plugins };
  }

  @Delete('plugins/:pluginId')
  async deletePlugin(
    @Param('pluginId') pluginId: string,
  ): Promise<{ deleted: boolean; pluginId: string }> {
    await this.callKong(() => this.kongAdapter.deletePlugin(pluginId));

    return {
      deleted: true,
      pluginId,
    };
  }
}
