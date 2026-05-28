export class UpdateProviderDto {
  displayName?: string; // updatable for all providers
  baseUrl?: string; // updatable for all providers
  aiProviderName?: string; // updatable for AI providers
  aiModelName?: string; // updatable for AI providers
}
