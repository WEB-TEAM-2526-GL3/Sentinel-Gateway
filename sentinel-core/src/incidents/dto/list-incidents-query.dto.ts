import { IsEnum, IsOptional } from 'class-validator';
import { IncidentStatus } from '../enum/incident-status.enum';

export class ListIncidentsQueryDto {
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;
}
