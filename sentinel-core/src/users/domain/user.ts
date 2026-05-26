import { UserRole } from './user-role.enum';
import { UserStatus } from './user-status.enum';

export interface CreateUserProps {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role?: UserRole;
  status?: UserStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export class User {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: CreateUserProps) {
    this.id = props.id;
    this.email = normalizeEmail(props.email);
    this.fullName = props.fullName.trim();
    this.passwordHash = props.passwordHash.trim();
    this.role = props.role ?? UserRole.ADMIN;
    this.status = props.status ?? UserStatus.ACTIVE;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? this.createdAt;

    this.validate();
  }

  static createAdmin(props: CreateUserProps): User {
    return new User({
      ...props,
      role: UserRole.ADMIN,
      status: props.status ?? UserStatus.ACTIVE,
    });
  }

  withStatus(status: UserStatus, updatedAt: Date = new Date()): User {
    return new User({
      id: this.id,
      email: this.email,
      fullName: this.fullName,
      passwordHash: this.passwordHash,
      role: this.role,
      status,
      createdAt: this.createdAt,
      updatedAt,
    });
  }

  private validate(): void {
    if (!this.id.trim()) {
      throw new Error('User id is required');
    }

    if (!this.email) {
      throw new Error('User email is required');
    }

    if (!this.fullName) {
      throw new Error('User full name is required');
    }

    if (!isLikelyPasswordHash(this.passwordHash)) {
      throw new Error(
        'passwordHash must be a pre-hashed value with no spaces and at least 20 characters',
      );
    }
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isLikelyPasswordHash(value: string): boolean {
  return value.length >= 20 && !/\s/.test(value);
}
