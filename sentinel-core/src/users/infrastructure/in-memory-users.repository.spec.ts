import { UserRole } from '../domain/user-role.enum';
import { UserStatus } from '../domain/user-status.enum';
import { User } from '../domain/user';
import { InMemoryUsersRepository } from './in-memory-users.repository';

describe('InMemoryUsersRepository', () => {
  let repository: InMemoryUsersRepository;

  beforeEach(() => {
    repository = new InMemoryUsersRepository();
  });

  it('preserves uniqueness by normalized email', async () => {
    const user = User.createAdmin({
      id: 'user-1',
      email: 'ADMIN@example.com',
      fullName: 'Admin User',
      passwordHash: '$2b$12$abcdefghijklmnopqrstuvABCDE1234567890',
    });

    await repository.create(user);

    await expect(
      repository.create(
        User.createAdmin({
          id: 'user-2',
          email: ' admin@example.com ',
          fullName: 'Another Admin',
          passwordHash: '$2b$12$abcdefghijklmnopqrstuvABCDE1234567891',
        }),
      ),
    ).rejects.toThrow('already exists');
  });

  it('sets timestamps and returns stored records', async () => {
    const user = User.createAdmin({
      id: 'user-1',
      email: 'admin@example.com',
      fullName: 'Admin User',
      passwordHash: '$2b$12$abcdefghijklmnopqrstuvABCDE1234567890',
    });

    const createdUser = await repository.create(user);
    const foundById = await repository.findById(createdUser.id);
    const foundByEmail = await repository.findByEmail(' ADMIN@example.com ');

    expect(createdUser.createdAt).toBeInstanceOf(Date);
    expect(createdUser.updatedAt).toBeInstanceOf(Date);
    expect(foundById).toEqual(createdUser);
    expect(foundByEmail).toEqual(createdUser);
    expect(createdUser.role).toBe(UserRole.ADMIN);
    expect(createdUser.status).toBe(UserStatus.ACTIVE);
  });

  it('returns null for missing records and updates status', async () => {
    expect(await repository.findById('missing')).toBeNull();
    expect(await repository.findByEmail('missing@example.com')).toBeNull();
    expect(
      await repository.updateStatus('missing', UserStatus.INACTIVE),
    ).toBeNull();

    const createdUser = await repository.create(
      User.createAdmin({
        id: 'user-1',
        email: 'admin@example.com',
        fullName: 'Admin User',
        passwordHash: '$2b$12$abcdefghijklmnopqrstuvABCDE1234567890',
      }),
    );

    const updatedUser = await repository.updateStatus(
      createdUser.id,
      UserStatus.INACTIVE,
    );

    expect(updatedUser?.status).toBe(UserStatus.INACTIVE);
    expect(updatedUser?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      createdUser.updatedAt.getTime(),
    );
  });
});
