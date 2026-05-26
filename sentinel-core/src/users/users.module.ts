import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { USERS_REPOSITORY } from './users.constants';
import { UserOrmEntity } from './infrastructure/typeorm/user.orm-entity';
import { TypeOrmUsersRepository } from './infrastructure/typeorm/typeorm-users.repository';

@Module({
  imports: [TypeOrmModule.forFeature([UserOrmEntity])],
  providers: [
    UsersService,
    TypeOrmUsersRepository,
    {
      provide: USERS_REPOSITORY,
      useExisting: TypeOrmUsersRepository,
    },
  ],
  exports: [UsersService, USERS_REPOSITORY],
})
export class UsersModule {}
