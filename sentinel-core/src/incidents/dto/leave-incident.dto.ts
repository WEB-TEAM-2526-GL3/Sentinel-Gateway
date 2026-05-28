import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class LeaveIncidentDto {
  @IsUUID()
  incidentId: string;

  @IsString()
  @IsNotEmpty()
  adminId: string;
}
