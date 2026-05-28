import { UserRole } from '../../users/enum/user-role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  fullName: string;
  role: UserRole;
}
