export class CreateLinkDto {
  clientId: string;
  providerId: string;
  kind: 'primary' | 'secondary-active';
}
