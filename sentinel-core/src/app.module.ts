import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Entities
import { Provider } from './providers/provider.entity';
import { GenericProvider } from './providers/generic-provider.entity';
import { AIProvider } from './providers/ai-provider.entity';
import { Client } from './clients/client.entity';
import { ClientProviderLink } from './links/link.entity';
import { Incident } from './incidents/incident.entity';
import { FailoverRule } from './incidents/failover-rule.entity';
import { RequestLimit } from './limits/request-limit.entity';
import { TokenLimit } from './limits/token-limit.entity';

// Modules
import { UsersModule } from './users/users.module';
import { KongModule } from './kong/kong.module';
import { KongAdapterModule } from './kong-adapter/kong-adapter.module';
import { ProviderModule } from './providers/provider.module';
import { ClientModule } from './clients/client.module';
import { LinkModule } from './links/link.module';
import { IncidentModule } from './incidents/incident.module';
import { LimitModule } from './limits/limit.module';
//import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    // TypeORM
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5433'),
      username: process.env.DB_USERNAME || 'sentinel',
      password: process.env.DB_PASSWORD || 'sentinel',
      database: process.env.DB_DATABASE || 'sentinel_gateway',
      entities: [
        Provider,
        GenericProvider,
        AIProvider,
        Client,
        ClientProviderLink,
        Incident,
        FailoverRule,
        RequestLimit,
        TokenLimit,
      ],
      synchronize: true,
    }),

    // Event Emitter
    EventEmitterModule.forRoot(),

    // Team modules
    UsersModule,
    KongModule,
    KongAdapterModule,

    // Domain modules
    ProviderModule,
    ClientModule,
    LinkModule,
    IncidentModule,
    LimitModule,

    // Metrics (Prometheus + MetricsService + Health + Limits)
    //MetricsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}