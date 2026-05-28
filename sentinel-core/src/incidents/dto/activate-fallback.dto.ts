import { IsNotEmpty, IsString, IsUrl, IsUUID } from 'class-validator';

export class ActivateFallbackDto {
  @IsUUID()
  incidentId: string;

  @IsString()
  @IsNotEmpty()
  adminId: string;

  @IsString()
  @IsNotEmpty()
  adminName: string;

  @IsString()
  @IsNotEmpty()
  serviceName: string;

  @IsUUID()
  fallbackProviderId: string;

  @IsUrl({ require_tld: false })
  fallbackUrl: string;
}
