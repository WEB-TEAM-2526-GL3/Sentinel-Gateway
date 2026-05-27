import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { DeleteUserDto } from '../auth/dto/delete-user.dto';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CeoSecretService } from '../auth/ceo-secret.service';

import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/entities/user.entity';

type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly usersService: UsersService,
    private readonly ceoSecretService: CeoSecretService,
  ) {}

  @Get('me')
  getMe(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  @Get('users')
  async listUsers() {
    const users = await this.usersService.findAll();
    return users.map((user) => this.toSafeUser(user));
  }

  @Delete('users/:id')
  async deleteUser(
    @Param('id') id: string,
    @Body() deleteUserDto: DeleteUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.ceoSecretService.validateOrThrow(deleteUserDto.ceoSecret);

    if (request.user.id === id) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const deletedUser = await this.usersService.deactivateUser(id);

    if (!deletedUser) {
      throw new NotFoundException('User not found');
    }

    return {
      message: 'User deleted successfully',
      user: this.toSafeUser(deletedUser),
    };
  }

  private toSafeUser(user: UserEntity) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
