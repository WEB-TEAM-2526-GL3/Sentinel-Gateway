import { User } from '../domain/user';
import { UserStatus } from '../domain/user-status.enum';

export interface UsersRepository {
  create(user: User): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  existsByEmail(email: string): Promise<boolean>;
  updateStatus(id: string, status: UserStatus): Promise<User | null>;
}
