import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { User } from '../users/domain/user';
import { DuplicateUserEmailError } from '../users/errors/duplicate-user-email.error';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { CeoSecretService } from './ceo-secret.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly ceoSecretService: CeoSecretService,
  ) {}

  async register(registerDto: RegisterDto) {
    this.ceoSecretService.validateOrThrow(registerDto.ceoSecret);

    try {
      const passwordHash = await bcrypt.hash(registerDto.password, 10);

      const user = await this.usersService.createAdminUser({
        email: registerDto.email,
        fullName: registerDto.fullName,
        passwordHash,
      });

      return this.buildAuthResponse(user);
    } catch (error) {
      if (error instanceof DuplicateUserEmailError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.getUserByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResponse(user);
  }

  logout() {
    return {
      message: 'Logged out successfully. Remove the token from the client.',
    };
  }

  private async buildAuthResponse(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '100h',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
      },
    };
  }
}
