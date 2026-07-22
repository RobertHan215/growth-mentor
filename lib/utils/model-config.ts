import { useSettingsStore } from '@/lib/store/settings';

/**
 * Get current model configuration from settings store
 */
export function getCurrentModelConfig() {
  const { providerId, modelId, providersConfig, useFrontendModelConfig } =
    useSettingsStore.getState();
  const modelString = providerId && modelId ? `${providerId}:${modelId}` : '';

  // Get current provider's config
  const providerConfig = providersConfig[providerId];

  return {
    providerId,
    modelId,
    modelString,
    apiKey: useFrontendModelConfig ? providerConfig?.apiKey || '' : '',
    baseUrl: useFrontendModelConfig ? providerConfig?.baseUrl || '' : '',
    providerType: providerConfig?.type,
    requiresApiKey: providerConfig?.requiresApiKey,
    isServerConfigured: providerConfig?.isServerConfigured,
    useFrontendModelConfig,
  };
}
