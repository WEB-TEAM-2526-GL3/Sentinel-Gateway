import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class IncidentActionDto {
  @IsUUID()
  incidentId: string;

  @IsString()
  @IsNotEmpty()
  adminId: string;

  @IsString()
  @IsNotEmpty()
  adminName: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
