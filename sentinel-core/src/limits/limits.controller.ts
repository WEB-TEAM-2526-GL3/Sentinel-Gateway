import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { LimitsService } from './limits.service';
import { SetRequestLimitDto } from './dto/set-request-limit.dto';
import { SetTokenLimitDto } from './dto/set-token-limit.dto';

@Controller('limits')
export class LimitsController {
  constructor(private readonly limitsService: LimitsService) {}

  @Get('requests')
  getRequestLimit(
    @Query('clientId') clientId: string,
    @Query('providerId') providerId: string,
  ) {
    return this.limitsService.getRequestLimit(clientId, providerId);
  }

  @Post('requests')
  setRequestLimit(@Body() dto: SetRequestLimitDto) {
    return this.limitsService.setRequestLimit(dto);
  }

  @Delete('requests/:id')
  archiveRequestLimit(@Param('id') id: string) {
    return this.limitsService.archiveRequestLimit(id);
  }

  @Get('tokens/:providerId')
  getTokenLimit(@Param('providerId') providerId: string) {
    return this.limitsService.getTokenLimit(providerId);
  }

  @Post('tokens')
  setTokenLimit(@Body() dto: SetTokenLimitDto) {
    return this.limitsService.setTokenLimit(dto);
  }

  @Delete('tokens/:id')
  archiveTokenLimit(@Param('id') id: string) {
    return this.limitsService.archiveTokenLimit(id);
  }
}
