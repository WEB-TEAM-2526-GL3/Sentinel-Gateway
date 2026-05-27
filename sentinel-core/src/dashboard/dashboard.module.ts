import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
