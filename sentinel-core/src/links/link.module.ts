import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientProviderLink } from './link.entity';
import { LinkRepository } from './link.repository';
import { LinkService } from './link.service';
import { ProviderModule } from '../providers/provider.module';
import { ClientModule } from '../clients/client.module';
import { KongAdapterModule } from '../kong-adapter/kong-adapter.module';
import { LinksController } from './links.controller';

@Module({
  controllers: [LinksController],
  imports: [
    TypeOrmModule.forFeature([ClientProviderLink]),
    ProviderModule,
    ClientModule,
    KongAdapterModule,
  ],
  providers: [LinkRepository, LinkService],
  exports: [LinkRepository, LinkService],
})
export class LinkModule {}
