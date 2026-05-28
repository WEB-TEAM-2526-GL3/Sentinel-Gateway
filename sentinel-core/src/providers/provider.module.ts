import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Provider } from './provider.entity';
import { AIProvider } from './ai-provider.entity';
import { ProviderRepository } from './provider.repository';
import { ProviderService } from './provider.service';
import { KongAdapterModule } from '../kong-adapter/kong-adapter.module';
import { LinkModule } from '../links/link.module';
import { ProvidersController } from './providers.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Provider, AIProvider]),
    KongAdapterModule,
    LinkModule,
  ],
  controllers: [ProvidersController],
  providers: [ProviderRepository, ProviderService],
  exports: [ProviderRepository, ProviderService],
})
export class ProviderModule {}
