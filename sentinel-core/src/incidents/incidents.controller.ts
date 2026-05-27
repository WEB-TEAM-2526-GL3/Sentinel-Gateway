import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { IncidentService } from './incident.service';
import { FailoverService } from './failover.service';
import { SetFailoverRuleDto } from './dto/set-failover-rule.dto';

@Controller()
export class IncidentsController {
  constructor(
    private readonly incidentService: IncidentService,
    private readonly failoverService: FailoverService,
  ) {}

  @Get('incidents')
  getByClient(@Query('clientId') clientId: string) {
    return this.incidentService.getIncidents(clientId);
  }

  @Get('failover-rules/:clientId')
  getRule(@Param('clientId') clientId: string) {
    return this.failoverService.getRule(clientId);
  }

  @Post('failover-rules')
  setRule(@Body() dto: SetFailoverRuleDto) {
    return this.failoverService.setRule(dto);
  }
}
