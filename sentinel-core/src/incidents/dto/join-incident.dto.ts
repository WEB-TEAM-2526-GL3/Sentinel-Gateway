import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class JoinIncidentDto {
  @IsUUID()
  incidentId: string;

  @IsString()
  @IsNotEmpty()
  adminId: string;

  @IsString()
  @IsNotEmpty()
  adminName: string;
}
