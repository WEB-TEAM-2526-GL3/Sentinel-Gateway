import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';

import { AuthModule } from '../auth/auth.module';
import { GatewayModule } from '../gateway/gateway.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { MessengerModule } from '../messenger/messenger.module';
import { MetricsModule } from '../metrics/metrics.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { UsersModule } from '../users/users.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { SentinelGraphqlResolver } from './sentinel-graphql.resolver';
import { GqlJwtAuthGuard } from './gql-jwt-auth.guard';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      introspection: true,
      playground: false,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],
      context: ({ req }: { req: unknown }) => ({ req }),
    }),
    AuthModule,
    UsersModule,
    GatewayModule,
    IncidentsModule,
    MonitoringModule,
    MetricsModule,
    WebhooksModule,
    MessengerModule,
  ],
  providers: [SentinelGraphqlResolver, GqlJwtAuthGuard],
})
export class SentinelGraphqlModule {}
