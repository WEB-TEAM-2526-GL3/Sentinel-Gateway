import { Controller, Get, Res } from '@nestjs/common';
import { AppService } from './app.service';
import type { Response } from 'express';
import { join } from 'path/win32';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('hello')
  getHello(): string {
    return this.appService.getHello();
  }

  @Get(['/', 'login', 'register', 'dashboard'])
  serveFrontend(@Res() response: Response) {
    return response.sendFile(join(process.cwd(), 'public', 'index.html'));
  }
}
