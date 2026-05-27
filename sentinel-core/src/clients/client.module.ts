import { Module } from '@nestjs/common';
import { TypeOrmModule, In } from '@nestjs/typeorm';
import { Client } from './client.entity';
import { ClientRepository } from './client.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Client])],
  providers: [ClientRepository],
  exports: [ClientRepository],
})
export class ClientModule {}