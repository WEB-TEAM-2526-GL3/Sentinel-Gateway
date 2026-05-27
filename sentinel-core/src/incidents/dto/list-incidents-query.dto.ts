import { IsEnum, IsOptional } from 'class-validator';
import { IncidentStatus } from '../domain/incident-status.enum';

export class ListIncidentsQueryDto {
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;
}
