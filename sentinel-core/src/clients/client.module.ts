import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './client.entity';
import { ClientRepository } from './client.repository';
import { ClientsController } from './clients.controller';

@Module({
  controllers: [ClientsController],
  imports: [TypeOrmModule.forFeature([Client])],
  providers: [ClientRepository],
  exports: [ClientRepository],
})
export class ClientModule {}
