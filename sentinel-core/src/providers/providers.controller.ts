import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ProviderService } from './provider.service';
import { CreateGenericProviderDto } from './dto/create-generic-provider.dto';
import { CreateAIProviderDto } from './dto/create-ai-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { RotateSecretDto } from './dto/rotate-secret.dto';

@Controller('providers')
export class ProvidersController {
  constructor(private readonly providerService: ProviderService) {}

  @Get()
  listAll() {
    return this.providerService.listProviders();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.providerService.getProvider(id);
  }

  @Post('generic')
  createGeneric(@Body() dto: CreateGenericProviderDto) {
    return this.providerService.registerGenericProvider(dto);
  }

  @Post('ai')
  createAI(@Body() dto: CreateAIProviderDto) {
    return this.providerService.registerAIProvider(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProviderDto) {
    return this.providerService.updateProvider(id, dto);
  }

  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.providerService.archiveProvider(id);
  }

  @Post(':id/rotate-secret')
  rotateSecret(@Param('id') id: string, @Body() dto: RotateSecretDto) {
    return this.providerService.rotateSecret(id, dto);
  }
}
