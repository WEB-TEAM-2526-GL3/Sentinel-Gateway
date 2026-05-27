import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Provider } from './provider.entity';
import { GenericProvider } from './generic-provider.entity';
import { AIProvider } from './ai-provider.entity';
import { ProviderRepository } from './provider.repository';
import { ProvidersController } from './providers.controller';

@Module({
  controllers: [ProvidersController],
  imports: [TypeOrmModule.forFeature([Provider, GenericProvider, AIProvider])],
  providers: [ProviderRepository],
  exports: [ProviderRepository],
})
export class ProviderModule {}
