export class CreateGenericProviderDto {
  kongServiceName: string; // immutable Kong Service identifier
  displayName: string; // human-readable label
  baseUrl: string;
  authMethod: 'bearer' | 'apiKey' | 'query';
  authHeaderName?: string;
  authParamName?: string;
  encryptedApiKey: string;
}
