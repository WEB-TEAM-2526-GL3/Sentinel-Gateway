import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KongAdapterModule } from '../kong-adapter/kong-adapter.module';
import { IncidentEntity } from './entities/incident.entity';
import { IncidentLogEntity } from './entities/incident-log.entity';
import { InMemoryIncidentsRepository } from './infrastructure/in-memory-incidents.repository';
import { TypeormIncidentsRepository } from './infrastructure/typeorm-incidents.repository';
import { IncidentRoomGateway } from './incident-room.gateway';
import { INCIDENTS_REPOSITORY } from './incidents.constants';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

const isTest = process.env.NODE_ENV === 'test';

@Module({
  imports: [
    KongAdapterModule,
    ...(isTest
      ? []
      : [
          TypeOrmModule.forRoot({
            type: 'postgres',
            host: process.env.SENTINEL_DB_HOST ?? 'localhost',
            port: Number(process.env.SENTINEL_DB_PORT ?? 5433),
            username: process.env.SENTINEL_DB_USER ?? 'sentinel',
            password: process.env.SENTINEL_DB_PASSWORD ?? 'sentinel',
            database: process.env.SENTINEL_DB_NAME ?? 'sentinel_gateway',
            entities: [IncidentEntity, IncidentLogEntity],
            synchronize: process.env.SENTINEL_DB_SYNCHRONIZE !== 'false',
          }),
          TypeOrmModule.forFeature([IncidentEntity, IncidentLogEntity]),
        ]),
  ],
  controllers: [IncidentsController],
  providers: [
    IncidentsService,
    IncidentRoomGateway,
    InMemoryIncidentsRepository,
    ...(isTest ? [] : [TypeormIncidentsRepository]),
    {
      provide: INCIDENTS_REPOSITORY,
      useExisting: isTest
        ? InMemoryIncidentsRepository
        : TypeormIncidentsRepository,
    },
  ],
  exports: [IncidentsService, INCIDENTS_REPOSITORY],
})
export class IncidentsModule {}
