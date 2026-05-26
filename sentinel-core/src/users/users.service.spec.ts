import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from './domain/user-role.enum';
import { UserStatus } from './domain/user-status.enum';
import { DuplicateUserEmailError } from './errors/duplicate-user-email.error';
import { InMemoryUsersRepository } from './infrastructure/in-memory-users.repository';
import { USERS_REPOSITORY } from './users.constants';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let usersService: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        InMemoryUsersRepository,
        {
          provide: USERS_REPOSITORY,
          useExisting: InMemoryUsersRepository,
        },
      ],
    }).compile();

    usersService = module.get<UsersService>(UsersService);
  });

  it('creates an admin user with normalized email and defaults', async () => {
    const user = await usersService.createAdminUser({
      email: '  ADMIN@Example.COM ',
      fullName: 'Admin User',
      passwordHash: '$2b$12$abcdefghijklmnopqrstuvABCDE1234567890',
    });

    expect(user.email).toBe('admin@example.com');
    expect(user.role).toBe(UserRole.ADMIN);
    expect(user.status).toBe(UserStatus.ACTIVE);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects duplicate email creation', async () => {
    await usersService.createAdminUser({
      email: 'admin@example.com',
      fullName: 'Admin User',
      passwordHash: '$2b$12$abcdefghijklmnopqrstuvABCDE1234567890',
    });

    await expect(
      usersService.createAdminUser({
        email: ' ADMIN@example.com ',
        fullName: 'Second Admin',
        passwordHash: '$2b$12$abcdefghijklmnopqrstuvABCDE1234567891',
      }),
    ).rejects.toBeInstanceOf(DuplicateUserEmailError);
  });

  it('fetches a user by id and email', async () => {
    const createdUser = await usersService.createAdminUser({
      email: 'admin@example.com',
      fullName: 'Admin User',
      passwordHash: '$2b$12$abcdefghijklmnopqrstuvABCDE1234567890',
    });

    await expect(usersService.getUserById(createdUser.id)).resolves.toEqual(
      createdUser,
    );
    await expect(
      usersService.getUserByEmail(' ADMIN@example.com '),
    ).resolves.toEqual(createdUser);
  });

  it('toggles status between active and inactive', async () => {
    const createdUser = await usersService.createAdminUser({
      email: 'admin@example.com',
      fullName: 'Admin User',
      passwordHash: '$2b$12$abcdefghijklmnopqrstuvABCDE1234567890',
    });

    const inactiveUser = await usersService.deactivateUser(createdUser.id);
    expect(inactiveUser?.status).toBe(UserStatus.INACTIVE);
    expect(inactiveUser?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      createdUser.updatedAt.getTime(),
    );

    const activeUser = await usersService.reactivateUser(createdUser.id);
    expect(activeUser?.status).toBe(UserStatus.ACTIVE);
    expect(activeUser?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      inactiveUser!.updatedAt.getTime(),
    );
  });
});
