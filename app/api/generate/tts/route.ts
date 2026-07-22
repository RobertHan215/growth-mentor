/**
 * Single TTS Generation API
 *
 * Generates TTS audio for a single text string and returns base64-encoded audio.
 * Called by the client in parallel for each speech action after a scene is generated.
 *
 * POST /api/generate/tts
 */

import { NextRequest } from 'next/server';
import { generateTTS } from '@/lib/audio/tts-providers';
import { resolveTTSApiKey, resolveTTSBaseUrl } from '@/lib/server/provider-config';
import { getDefaultProviderConfig } from '@/lib/server/default-provider-config';
import type { TTSProviderId } from '@/lib/audio/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { prisma } from '@/lib/db';

const log = createLogger('TTS API');

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text,
      audioId,
      ttsProviderId,
      ttsVoice,
      ttsSpeed,
      ttsApiKey,
      ttsBaseUrl,
      useFrontendTTSConfig,
      templateId,
    } = body as {
      text: string;
      audioId: string;
      ttsProviderId: TTSProviderId;
      ttsVoice: string;
      ttsSpeed?: number;
      ttsApiKey?: string;
      ttsBaseUrl?: string;
      useFrontendTTSConfig?: boolean;
      templateId?: string;
    };

    // Validate required fields
    if (!text || !audioId || (!templateId && (!ttsProviderId || !ttsVoice))) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'Missing required fields: text, audioId, and either templateId or ttsProviderId+ttsVoice',
      );
    }

    let characterTtsConfig: {
      providerId?: TTSProviderId;
      voice?: string;
      baseUrl?: string;
      apiKey?: string;
    } | null = null;

    if (templateId) {
      try {
        const template = await prisma.aiCharacterTemplate.findUnique({
          where: { id: templateId },
          select: { profile: true },
        });
        if (template && template.profile && typeof template.profile === 'object') {
          const profile = template.profile as Record<string, any>;
          if (profile.ttsConfig && typeof profile.ttsConfig === 'object') {
            characterTtsConfig = profile.ttsConfig;
            log.info(`[TTS Route] Resolved character-specific TTS config for template=${templateId}`);
          }
        }
      } catch (err) {
        log.error(`[TTS Route] Failed to query character template=${templateId}:`, err);
      }
    }

    const defaults = await getDefaultProviderConfig();

    let mappedProviderId: TTSProviderId | undefined;
    let mappedBaseUrl: string | undefined;
    let mappedApiKey: string | undefined;

    const voiceFromChar = characterTtsConfig?.voice;
    if (voiceFromChar && defaults.ttsVoicesMap) {
      const mapping = defaults.ttsVoicesMap.find((m) => m.voiceId === voiceFromChar);
      if (mapping) {
        mappedProviderId = mapping.providerId as TTSProviderId;
        mappedBaseUrl = mapping.baseUrl;
        mappedApiKey = mapping.apiKey;
        log.info(`[TTS Route] Mapped voiceId=${voiceFromChar} to providerId=${mappedProviderId}`);
      }
    }
    
    const providerIdFromChar = characterTtsConfig?.providerId || mappedProviderId;
    const voiceFromCharToUse = voiceFromChar;
    const baseUrlFromChar = characterTtsConfig?.baseUrl || mappedBaseUrl;
    const apiKeyFromChar = characterTtsConfig?.apiKey || mappedApiKey;

    const allowClientConfig = useFrontendTTSConfig === true;
    const effectiveProviderId = providerIdFromChar || (allowClientConfig
      ? ttsProviderId
      : (defaults.tts?.providerId as TTSProviderId | undefined) || ttsProviderId);
    const effectiveVoice = voiceFromChar || (allowClientConfig ? ttsVoice : defaults.tts?.voice || ttsVoice);
    const effectiveSpeed = allowClientConfig ? ttsSpeed : (defaults.tts?.speed ?? ttsSpeed);
    const dbDefault = defaults.tts?.providerId === effectiveProviderId ? defaults.tts : undefined;

    // Reject browser-native TTS — must be handled client-side
    if (effectiveProviderId === 'browser-native-tts') {
      return apiError('INVALID_REQUEST', 400, 'browser-native-tts must be handled client-side');
    }
    const clientBaseUrl = allowClientConfig ? ttsBaseUrl || undefined : undefined;
    if (clientBaseUrl && process.env.NODE_ENV === 'production') {
      const ssrfError = validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    // Resolve API key: character key > client key > server config
    const apiKey =
      apiKeyFromChar ||
      (allowClientConfig && ttsApiKey
        ? ttsApiKey
        : dbDefault?.apiKey || resolveTTSApiKey(effectiveProviderId));
    const baseUrl = baseUrlFromChar || clientBaseUrl || dbDefault?.baseUrl || resolveTTSBaseUrl(effectiveProviderId);

    // ── Key 解析诊断日志 ──
    log.info(`[TTS Route] provider=${effectiveProviderId}, voice=${effectiveVoice}`);
    log.info(
      `[TTS Route] client ttsApiKey provided: ${!!ttsApiKey} (${ttsApiKey ? ttsApiKey.slice(0, 6) + '***' : 'none'})`,
    );
    log.info(`[TTS Route] client ttsBaseUrl provided: ${!!ttsBaseUrl} (${ttsBaseUrl || 'none'})`);
    log.info(
      `[TTS Route] resolved apiKey: ${apiKey ? apiKey.slice(0, 6) + '***' : '⚠️ EMPTY — 未配置!'}`,
    );
    log.info(`[TTS Route] resolved baseUrl: ${baseUrl || '⚠️ EMPTY — 未配置!'}`);

    // Build TTS config
    const config = {
      providerId: effectiveProviderId,
      voice: effectiveVoice,
      speed: effectiveSpeed ?? 1.0,
      apiKey,
      baseUrl,
    };

    log.info(
      `Generating TTS: provider=${effectiveProviderId}, voice=${effectiveVoice}, audioId=${audioId}, textLen=${text.length}`,
    );

    // Generate audio
    const { audio, format } = await generateTTS(config, text);

    // Convert to base64
    const base64 = Buffer.from(audio).toString('base64');
    const buffer = Buffer.from(audio);

    // Upload to StorageProvider if CUSTOM_UPLOAD_URL is configured
    let uploadedUrl = '';
    if (process.env.CUSTOM_UPLOAD_URL) {
      try {
        const crypto = await import('crypto');
        const hash = crypto.createHash('md5').update(buffer).digest('hex');
        const { getStorageProvider } = await import('@/lib/storage');
        const provider = getStorageProvider();
        uploadedUrl = await provider.upload(hash, buffer, 'audio', `audio/${format || 'mp3'}`);
      } catch (uploadError) {
        log.error('Failed to upload generated TTS to custom storage:', uploadError);
      }
    }

    return apiSuccess({ audioId, base64, format, url: uploadedUrl });
  } catch (error) {
    log.error('TTS generation error:', error);
    return apiError(
      'GENERATION_FAILED',
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
