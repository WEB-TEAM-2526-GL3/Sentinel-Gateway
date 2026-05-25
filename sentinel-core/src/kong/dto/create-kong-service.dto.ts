import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { CreateKongRouteDto } from './create-kong-route.dto';

export class CreateKongServiceDto {
  @IsString()
  name!: string;

  @IsString()
  url!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateKongRouteDto)
  route?: CreateKongRouteDto;
}
