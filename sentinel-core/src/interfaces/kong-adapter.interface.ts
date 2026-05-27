export interface ActivateFallbackInput {
  serviceName: string;
  fallbackProviderId: string;
  fallbackUrl: string;
}

export interface KongAdapterInterface {
  activateFallback(input: ActivateFallbackInput): Promise<void>;
}
