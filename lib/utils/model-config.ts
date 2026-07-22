import { useSettingsStore } from '@/lib/store/settings';

/**
 * Get current model configuration from settings store.
 *
 * If the user has entered an API key in Settings, always send it (same path as
 * Settings "test connection"). Otherwise fall back to server-side keys.
 */
export function getCurrentModelConfig() {
  const { providerId, modelId, providersConfig, useFrontendModelConfig } =
    useSettingsStore.getState();
  const modelString = providerId && modelId ? `${providerId}:${modelId}` : '';

  // Get current provider's config
  const providerConfig = providersConfig[providerId];
  const clientApiKey = providerConfig?.apiKey?.trim() || '';
  // Prefer client credentials when present so Settings-tested keys actually work in chat.
  const useClient = useFrontendModelConfig || !!clientApiKey;

  return {
    providerId,
    modelId,
    modelString,
    apiKey: useClient ? clientApiKey : '',
    baseUrl: useClient ? providerConfig?.baseUrl || '' : '',
    providerType: providerConfig?.type,
    requiresApiKey: providerConfig?.requiresApiKey,
    isServerConfigured: providerConfig?.isServerConfigured,
    useFrontendModelConfig: useClient,
  };
}
