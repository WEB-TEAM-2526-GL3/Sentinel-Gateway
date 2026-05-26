import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { User } from './domain/user';
import { UserStatus } from './domain/user-status.enum';
import { CreateAdminUserInput } from './dto/create-admin-user.input';
import { DuplicateUserEmailError } from './errors/duplicate-user-email.error';
import type { UsersRepository } from './repositories/users.repository';
import { USERS_REPOSITORY } from './users.constants';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepository,
  ) {}

  async createAdminUser(input: CreateAdminUserInput): Promise<User> {
    const existingUser = await this.usersRepository.existsByEmail(input.email);

    if (existingUser) {
      throw new DuplicateUserEmailError(input.email.trim().toLowerCase());
    }

    const user = User.createAdmin({
      id: randomUUID(),
      email: input.email,
      fullName: input.fullName,
      passwordHash: input.passwordHash,
    });

    return this.usersRepository.create(user);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findByEmail(email);
  }

  async deactivateUser(id: string): Promise<User | null> {
    return this.usersRepository.updateStatus(id, UserStatus.INACTIVE);
  }

  async reactivateUser(id: string): Promise<User | null> {
    return this.usersRepository.updateStatus(id, UserStatus.ACTIVE);
  }
}
