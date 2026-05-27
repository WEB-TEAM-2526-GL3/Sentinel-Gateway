import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { IncidentSeverity } from '../domain/incident-severity.enum';

export class CreateIncidentDto {
  @IsUUID()
  serviceId: string;

  @IsUUID()
  providerId: string;

  @IsEnum(IncidentSeverity)
  severity: IncidentSeverity;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsNotEmpty()
  adminId: string;

  @IsString()
  @IsNotEmpty()
  adminName: string;
}
