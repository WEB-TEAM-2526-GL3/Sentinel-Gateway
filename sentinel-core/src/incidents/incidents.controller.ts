import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';
import { IncidentEntity } from './entities/incident.entity';
import { IncidentSnapshot, IncidentsService } from './incidents.service';

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  createIncident(@Body() body: CreateIncidentDto): Promise<IncidentSnapshot> {
    return this.incidentsService.createIncident(body);
  }

  @Get()
  listIncidents(
    @Query() query: ListIncidentsQueryDto,
  ): Promise<IncidentEntity[]> {
    return this.incidentsService.listIncidents(query.status);
  }

  @Get(':id')
  getIncident(@Param('id') id: string): Promise<IncidentSnapshot> {
    return this.incidentsService.getIncidentSnapshot(id);
  }
}
