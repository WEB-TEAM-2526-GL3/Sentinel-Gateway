import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GatewayAdapterModule } from '../gateway-adapter/gateway-adapter.module';
import { IncidentEntity } from './entities/incident.entity';
import { IncidentLogEntity } from './entities/incident-log.entity';
import { IncidentRoomGateway } from './incident-room.gateway';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [
    GatewayAdapterModule,
    TypeOrmModule.forFeature([IncidentEntity, IncidentLogEntity]),
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentRoomGateway],
  exports: [IncidentsService],
})
export class IncidentsModule {}
