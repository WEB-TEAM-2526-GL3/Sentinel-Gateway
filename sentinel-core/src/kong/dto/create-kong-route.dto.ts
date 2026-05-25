import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ArrayNotEmpty,
} from 'class-validator';

export class CreateKongRouteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  paths!: string[];

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
