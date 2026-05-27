import { Module } from '@nestjs/common';
import { TypeOrmModule, In} from '@nestjs/typeorm';
import { ClientProviderLink } from './link.entity';
import { LinkRepository } from './link.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ClientProviderLink])],
  providers: [LinkRepository],
  exports: [LinkRepository],
})
export class LinkModule {}