import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IncidentsModule } from './incidents/incidents.module';
import { KongModule } from './kong/kong.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [KongModule, UsersModule, IncidentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
