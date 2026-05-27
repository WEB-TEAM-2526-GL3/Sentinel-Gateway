import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { KongAdapterService } from './kong-adapter.service';

@Module({
  imports: [HttpModule],
  providers: [KongAdapterService],
  exports: [KongAdapterService],
})
export class KongAdapterModule {}
