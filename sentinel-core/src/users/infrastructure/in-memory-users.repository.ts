import { Injectable } from '@nestjs/common';
import { User } from '../domain/user';
import { UserStatus } from '../domain/user-status.enum';
import { normalizeEmail } from '../domain/user';
import { UsersRepository } from '../repositories/users.repository';

@Injectable()
export class InMemoryUsersRepository implements UsersRepository {
  private readonly usersById = new Map<string, User>();
  private readonly userIdsByEmail = new Map<string, string>();

  async create(user: User): Promise<User> {
    const normalizedEmail = normalizeEmail(user.email);

    if (this.userIdsByEmail.has(normalizedEmail)) {
      throw new Error(`A user with email "${normalizedEmail}" already exists`);
    }

    this.usersById.set(user.id, user);
    this.userIdsByEmail.set(normalizedEmail, user.id);

    return user;
  }

  async findById(id: string): Promise<User | null> {
    return this.usersById.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = normalizeEmail(email);
    const userId = this.userIdsByEmail.get(normalizedEmail);

    if (!userId) {
      return null;
    }

    return this.usersById.get(userId) ?? null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.userIdsByEmail.has(normalizeEmail(email));
  }

  async updateStatus(id: string, status: UserStatus): Promise<User | null> {
    const existingUser = this.usersById.get(id);

    if (!existingUser) {
      return null;
    }

    const updatedUser = existingUser.withStatus(status);
    this.usersById.set(id, updatedUser);

    return updatedUser;
  }
}
