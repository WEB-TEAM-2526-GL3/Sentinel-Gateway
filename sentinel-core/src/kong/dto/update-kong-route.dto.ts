import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateKongRouteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paths?: string[];

  @IsOptional()
  @IsBoolean()
  stripPath?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  methods?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hosts?: string[];
}
