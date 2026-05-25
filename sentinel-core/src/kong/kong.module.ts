import { Module } from '@nestjs/common';
import { KongAdapterModule } from '../kong-adapter/kong-adapter.module';
import { KongController } from './kong.controller';

@Module({
  imports: [KongAdapterModule],
  controllers: [KongController],
})
export class KongModule {}
