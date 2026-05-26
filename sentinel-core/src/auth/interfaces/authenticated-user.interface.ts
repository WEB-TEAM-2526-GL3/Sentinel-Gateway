import { UserRole } from '../../users/domain/user-role.enum';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}
