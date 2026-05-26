import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { KongModule } from './kong/kong.module';
import { UsersModule } from './users/users.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5433),
      username: process.env.DB_USERNAME ?? 'sentinel',
      password: process.env.DB_PASSWORD ?? 'sentinel',
      database: process.env.DB_DATABASE ?? 'sentinel_gateway',
      autoLoadEntities: true,
      synchronize: true,
    }),
    UsersModule,
    AuthModule,
    KongModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
