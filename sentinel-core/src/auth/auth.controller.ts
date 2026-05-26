import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { CeoSecretService } from './ceo-secret.service';
import { UsersService } from '../users/users.service';

type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly ceoSecretService: CeoSecretService,
    private readonly usersService: UsersService,
  ) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    this.ceoSecretService.validateOrThrow(registerDto.ceoSecret);
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout() {
    return this.authService.logout();
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  @UseGuards(JwtAuthGuard)
  @Delete('admins/:id')
  async deleteAdmin(
    @Param('id') id: string,
    @Body() deleteAdminDto: DeleteUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.ceoSecretService.validateOrThrow(deleteAdminDto.ceoSecret);

    if (request.user.id === id) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    const deletedUser = await this.usersService.deactivateUser(id);

    if (!deletedUser) {
      throw new NotFoundException('Admin not found');
    }

    return {
      message: 'Admin deactivated successfully',
      user: {
        id: deletedUser.id,
        email: deletedUser.email,
        fullName: deletedUser.fullName,
        role: deletedUser.role,
        status: deletedUser.status,
      },
    };
  }
}
