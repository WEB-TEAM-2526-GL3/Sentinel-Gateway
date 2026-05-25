import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateKongPluginDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
