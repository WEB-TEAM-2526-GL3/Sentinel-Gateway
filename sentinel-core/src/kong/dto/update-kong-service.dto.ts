import { IsString } from 'class-validator';

export class UpdateKongServiceDto {
  @IsString()
  url!: string;
}
