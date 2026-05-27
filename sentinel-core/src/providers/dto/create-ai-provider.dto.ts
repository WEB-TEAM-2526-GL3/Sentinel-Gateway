export class CreateAIProviderDto {
  name: string;
  modelName: string;
  baseUrl: string;
  authMethod: 'bearer' | 'apiKey' | 'query';
  authHeaderName?: string;
  authParamName?: string;
  encryptedApiKey: string;
}
