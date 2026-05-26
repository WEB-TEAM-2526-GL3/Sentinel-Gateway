import { Module } from '@nestjs/common';
import { InMemoryUsersRepository } from './infrastructure/in-memory-users.repository';
import { UsersService } from './users.service';
import { USERS_REPOSITORY } from './users.constants';

@Module({
  providers: [
    UsersService,
    InMemoryUsersRepository,
    {
      provide: USERS_REPOSITORY,
      useExisting: InMemoryUsersRepository,
    },
  ],
  exports: [UsersService, USERS_REPOSITORY],
})
export class UsersModule {}
