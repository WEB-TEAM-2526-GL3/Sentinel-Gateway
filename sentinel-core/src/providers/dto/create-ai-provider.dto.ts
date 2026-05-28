export class CreateAIProviderDto {
  kongServiceName: string; // immutable Kong Service identifier
  displayName: string; // human-readable label
  aiProviderName: string; // e.g. "openai", "gemini"
  aiModelName: string; // e.g. "gpt-4o", "gemini-2.5-flash"
  baseUrl: string;
  authMethod: 'bearer' | 'apiKey' | 'query';
  authHeaderName?: string;
  authParamName?: string;
  encryptedApiKey: string;
}
