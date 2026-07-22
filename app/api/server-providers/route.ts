import {
  getServerProviders,
  getServerTTSProviders,
  getServerASRProviders,
  getServerPDFProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerWebSearchProviders,
} from '@/lib/server/provider-config';
import {
  getDefaultProviderConfig,
  toPublicDefaultProviderConfig,
} from '@/lib/server/default-provider-config';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('ServerProviders');

export async function GET() {
  try {
    const defaults = toPublicDefaultProviderConfig(await getDefaultProviderConfig());
    const providers = getServerProviders();

    // Ensure the DB-default LLM provider is visible/selectable in the UI even
    // when it only exists as a managed default (not via env/YAML keys).
    if (defaults.llm?.providerId && !providers[defaults.llm.providerId]) {
      providers[defaults.llm.providerId] = {
        models: defaults.llm.modelId ? [defaults.llm.modelId] : undefined,
      };
    }

    return apiSuccess({
      providers,
      tts: getServerTTSProviders(),
      asr: getServerASRProviders(),
      pdf: getServerPDFProviders(),
      image: getServerImageProviders(),
      video: getServerVideoProviders(),
      webSearch: getServerWebSearchProviders(),
      defaults,
    });
  } catch (error) {
    log.error('Error fetching server providers:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
