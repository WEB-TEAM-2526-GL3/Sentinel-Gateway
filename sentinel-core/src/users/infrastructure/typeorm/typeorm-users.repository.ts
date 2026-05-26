import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, normalizeEmail } from '../../domain/user';
import { UserStatus } from '../../domain/user-status.enum';
import { UsersRepository } from '../../repositories/users.repository';
import { UserOrmEntity } from './user.orm-entity';

@Injectable()
export class TypeOrmUsersRepository implements UsersRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repository: Repository<UserOrmEntity>,
  ) {}

  async create(user: User): Promise<User> {
    const entity = this.toEntity(user);
    const saved = await this.repository.save(entity);
    return this.toDomain(saved);
  }

  async findById(id: string): Promise<User | null> {
    const entity = await this.repository.findOne({ where: { id } });
    return entity ? this.toDomain(entity) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const entity = await this.repository.findOne({
      where: { email: normalizeEmail(email) },
    });

    return entity ? this.toDomain(entity) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.repository.count({
      where: { email: normalizeEmail(email) },
    });

    return count > 0;
  }

  async updateStatus(id: string, status: UserStatus): Promise<User | null> {
    const entity = await this.repository.findOne({ where: { id } });

    if (!entity) {
      return null;
    }

    entity.status = status;

    const saved = await this.repository.save(entity);
    return this.toDomain(saved);
  }

  private toEntity(user: User): UserOrmEntity {
    const entity = new UserOrmEntity();

    entity.id = user.id;
    entity.email = user.email;
    entity.fullName = user.fullName;
    entity.passwordHash = user.passwordHash;
    entity.role = user.role;
    entity.status = user.status;
    entity.createdAt = user.createdAt;
    entity.updatedAt = user.updatedAt;

    return entity;
  }

  private toDomain(entity: UserOrmEntity): User {
    return User.createAdmin({
      id: entity.id,
      email: entity.email,
      fullName: entity.fullName,
      passwordHash: entity.passwordHash,
      role: entity.role,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }
}
