import { Provider } from './provider.entity';

export function buildAIProxyConfig(
  provider: Provider,
  plaintextApiKey: string,
): Record<string, unknown> {
  const auth = provider.auth;
  const ai = provider.aiProvider;

  const config: Record<string, unknown> = {
    route_type: 'llm/v1/chat',
    model: {
      provider: ai?.aiProviderName ?? '',
      name: ai?.aiModelName ?? '',
    },
    logging: { log_statistics: true },
  };

  switch (auth.method) {
    case 'query':
      config.auth = {
        param_name: auth.paramName,
        param_value: plaintextApiKey,
        param_location: 'query',
      };
      break;
    case 'bearer':
      config.auth = {
        header_name: auth.headerName,
        header_value: `Bearer ${plaintextApiKey}`,
      };
      break;
    case 'apiKey':
      config.auth = {
        header_name: auth.headerName,
        header_value: plaintextApiKey,
      };
      break;
  }

  return config;
}

export function buildAuthHeader(
  provider: Provider,
  plaintextApiKey: string,
): string {
  const auth = provider.auth;
  switch (auth.method) {
    case 'bearer':
      return `Authorization: Bearer ${plaintextApiKey}`;
    case 'apiKey':
      return `${auth.headerName}: ${plaintextApiKey}`;
    default:
      return '';
  }
}
