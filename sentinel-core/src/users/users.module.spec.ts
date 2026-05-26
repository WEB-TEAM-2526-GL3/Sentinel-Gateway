import { Test, TestingModule } from '@nestjs/testing';
import { InMemoryUsersRepository } from './infrastructure/in-memory-users.repository';
import { USERS_REPOSITORY } from './users.constants';
import { UsersModule } from './users.module';
import { UsersService } from './users.service';

describe('UsersModule', () => {
  it('resolves the service and repository provider', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile();

    expect(module.get<UsersService>(UsersService)).toBeInstanceOf(UsersService);
    expect(module.get(USERS_REPOSITORY)).toBeInstanceOf(
      InMemoryUsersRepository,
    );
  });
});
