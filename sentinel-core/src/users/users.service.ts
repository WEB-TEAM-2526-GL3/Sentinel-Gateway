import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { UserStatus } from './enum/user-status.enum';
import { CreateAdminUserInput } from './dto/create-admin-user.input';
import { UserEntity } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { UserRole } from './enum/user-role.enum';
import { Repository } from 'typeorm';
import { GenericService } from '../common/generic.service';

@Injectable()
export class UsersService extends GenericService<UserEntity, string> {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userOrmRepository: Repository<UserEntity>,
  ) {
    super(userOrmRepository);
  }

  async createAdminUser(input: CreateAdminUserInput): Promise<UserEntity> {
    const existingUser = await this.genericRepository.existsBy({
      email: input.email,
    });

    if (existingUser) {
      throw new ConflictException(
        input.email.trim().toLowerCase() + ' is already in use',
      );
    }

    const user = this.genericRepository.create({
      id: randomUUID(),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      ...input,
    });

    return this.genericRepository.save(user);
  }

  async updateStatus(
    id: string,
    status: UserStatus,
  ): Promise<UserEntity | null> {
    const entity = await this.genericRepository.findOneBy({ id });

    if (!entity) {
      return null;
    }

    entity.status = status;

    return this.genericRepository.save(entity);
  }

  async deactivateUser(id: string): Promise<UserEntity | null> {
    return this.updateStatus(id, UserStatus.INACTIVE);
  }

  async reactivateUser(id: string): Promise<UserEntity | null> {
    return this.updateStatus(id, UserStatus.ACTIVE);
  }
}
