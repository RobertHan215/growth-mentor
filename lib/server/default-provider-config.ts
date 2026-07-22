import { prisma } from '@/lib/db';
import type { ProviderType } from '@/lib/types/provider';

export const DEFAULT_PROVIDER_CONFIG_KEY = 'default_provider_config';

export interface DefaultProviderConfig {
  llm?: {
    providerId: string;
    modelId: string;
    apiKey?: string;
    baseUrl?: string;
    providerType?: ProviderType;
    requiresApiKey?: boolean;
  };
  tts?: {
    providerId: string;
    voice?: string;
    speed?: number;
    apiKey?: string;
    baseUrl?: string;
  };
  asr?: {
    providerId: string;
    language?: string;
    apiKey?: string;
    baseUrl?: string;
    thirdPartyEndpointType?: 'legacy-json' | 'funasr';
  };
  pdf?: {
    providerId: string;
    apiKey?: string;
    baseUrl?: string;
  };
  ttsVoicesMap?: {
    voiceId: string;
    providerId: string;
    name?: string;
    apiKey?: string;
    baseUrl?: string;
  }[];
}

export interface PublicDefaultProviderConfig {
  llm?: {
    providerId: string;
    modelId: string;
  };
  tts?: {
    providerId: string;
    voice?: string;
    speed?: number;
  };
  asr?: {
    providerId: string;
    language?: string;
  };
  pdf?: {
    providerId: string;
  };
  ttsVoicesMap?: {
    voiceId: string;
    providerId: string;
    name?: string;
    apiKey?: string;
    baseUrl?: string;
  }[];
}

type SystemConfigRow = {
  value: unknown;
};

let tableReady = false;

async function ensureSystemConfigTable() {
  if (tableReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS system_configs (
      \`key\` VARCHAR(191) NOT NULL,
      \`value\` JSON NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`key\`)
    )
  `);
  tableReady = true;
}

function parseStoredValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeConfig(value: unknown): DefaultProviderConfig {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const llm = raw.llm && typeof raw.llm === 'object' ? (raw.llm as Record<string, unknown>) : null;
  const tts = raw.tts && typeof raw.tts === 'object' ? (raw.tts as Record<string, unknown>) : null;
  const asr = raw.asr && typeof raw.asr === 'object' ? (raw.asr as Record<string, unknown>) : null;
  const pdf = raw.pdf && typeof raw.pdf === 'object' ? (raw.pdf as Record<string, unknown>) : null;

  const normalized: DefaultProviderConfig = {};

  const llmProviderId = nonEmpty(llm?.providerId);
  const llmModelId = nonEmpty(llm?.modelId);
  if (llmProviderId && llmModelId) {
    normalized.llm = {
      providerId: llmProviderId,
      modelId: llmModelId,
      apiKey: nonEmpty(llm?.apiKey),
      baseUrl: nonEmpty(llm?.baseUrl),
      providerType: nonEmpty(llm?.providerType) as ProviderType | undefined,
      requiresApiKey: typeof llm?.requiresApiKey === 'boolean' ? llm.requiresApiKey : undefined,
    };
  }

  const ttsProviderId = nonEmpty(tts?.providerId);
  if (ttsProviderId) {
    normalized.tts = {
      providerId: ttsProviderId,
      voice: nonEmpty(tts?.voice),
      speed: typeof tts?.speed === 'number' ? tts.speed : undefined,
      apiKey: nonEmpty(tts?.apiKey),
      baseUrl: nonEmpty(tts?.baseUrl),
    };
  }

  const asrProviderId = nonEmpty(asr?.providerId);
  if (asrProviderId) {
    normalized.asr = {
      providerId: asrProviderId,
      language: nonEmpty(asr?.language),
      apiKey: nonEmpty(asr?.apiKey),
      baseUrl: nonEmpty(asr?.baseUrl),
      thirdPartyEndpointType: asr?.thirdPartyEndpointType === 'funasr' ? 'funasr' : 'legacy-json',
    };
  }

  const pdfProviderId = nonEmpty(pdf?.providerId);
  if (pdfProviderId) {
    normalized.pdf = {
      providerId: pdfProviderId,
      apiKey: nonEmpty(pdf?.apiKey),
      baseUrl: nonEmpty(pdf?.baseUrl),
    };
  }

  if (Array.isArray(raw.ttsVoicesMap)) {
    normalized.ttsVoicesMap = raw.ttsVoicesMap
      .map((item: any) => ({
        voiceId: nonEmpty(item?.voiceId) || '',
        providerId: nonEmpty(item?.providerId) || '',
        name: nonEmpty(item?.name),
        apiKey: nonEmpty(item?.apiKey),
        baseUrl: nonEmpty(item?.baseUrl),
      }))
      .filter((item) => item.voiceId && item.providerId);
  }

  return normalized;
}

export async function getDefaultProviderConfig(): Promise<DefaultProviderConfig> {
  try {
    await ensureSystemConfigTable();

    const rows = await prisma.$queryRaw<SystemConfigRow[]>`
      SELECT \`value\`
      FROM system_configs
      WHERE \`key\` = ${DEFAULT_PROVIDER_CONFIG_KEY}
      LIMIT 1
    `;

    return normalizeConfig(parseStoredValue(rows[0]?.value));
  } catch (error) {
    console.warn('[default-provider-config] Failed to load default config:', error);
    return {};
  }
}

export async function saveDefaultProviderConfig(config: unknown): Promise<DefaultProviderConfig> {
  await ensureSystemConfigTable();

  const normalized = normalizeConfig(config);
  const value = JSON.stringify(normalized);

  await prisma.$executeRaw`
    INSERT INTO system_configs (\`key\`, \`value\`, \`created_at\`, \`updated_at\`)
    VALUES (${DEFAULT_PROVIDER_CONFIG_KEY}, ${value}, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      \`value\` = VALUES(\`value\`),
      \`updated_at\` = CURRENT_TIMESTAMP(3)
  `;

  return normalized;
}

export function toPublicDefaultProviderConfig(
  config: DefaultProviderConfig,
): PublicDefaultProviderConfig {
  return {
    ...(config.llm
      ? { llm: { providerId: config.llm.providerId, modelId: config.llm.modelId } }
      : {}),
    ...(config.tts
      ? {
          tts: {
            providerId: config.tts.providerId,
            voice: config.tts.voice,
            speed: config.tts.speed,
          },
        }
      : {}),
    ...(config.asr
      ? { asr: { providerId: config.asr.providerId, language: config.asr.language } }
      : {}),
    ...(config.pdf ? { pdf: { providerId: config.pdf.providerId } } : {}),
    ...(config.ttsVoicesMap
      ? {
          ttsVoicesMap: config.ttsVoicesMap.map((item) => ({
            voiceId: item.voiceId,
            providerId: item.providerId,
            name: item.name,
            apiKey: item.apiKey ? '******' : undefined,
            baseUrl: item.baseUrl,
          })),
        }
      : {}),
  };
}
