export class CreateGenericProviderDto {
  name: string;
  baseUrl: string;
  authMethod: 'bearer' | 'apiKey' | 'query';
  authHeaderName?: string;
  authParamName?: string;
  encryptedApiKey: string;
}
