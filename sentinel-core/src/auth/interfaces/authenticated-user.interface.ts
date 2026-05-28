import { UserRole } from '../../users/enum/user-role.enum';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}
