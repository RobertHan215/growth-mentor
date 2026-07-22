import { prisma } from '@/lib/db';
import {
  ONE_ON_ONE_GLOBAL_CONFIG_KEY,
  type OneOnOneGlobalConfig,
  normalizeOneOnOneConfig,
} from '@/lib/training/one-on-one-config';

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

export async function getOneOnOneGlobalConfig(): Promise<OneOnOneGlobalConfig> {
  try {
    await ensureSystemConfigTable();

    const rows = await prisma.$queryRaw<SystemConfigRow[]>`
    SELECT \`value\`
    FROM system_configs
    WHERE \`key\` = ${ONE_ON_ONE_GLOBAL_CONFIG_KEY}
    LIMIT 1
  `;

    return normalizeOneOnOneConfig(parseStoredValue(rows[0]?.value));
  } catch (error) {
    console.warn('[one-on-one-config] Failed to load global config:', error);
    return normalizeOneOnOneConfig(null);
  }
}

export async function saveOneOnOneGlobalConfig(config: unknown): Promise<OneOnOneGlobalConfig> {
  await ensureSystemConfigTable();

  const normalized = normalizeOneOnOneConfig(config);
  const value = JSON.stringify(normalized);

  await prisma.$executeRaw`
    INSERT INTO system_configs (\`key\`, \`value\`, \`created_at\`, \`updated_at\`)
    VALUES (${ONE_ON_ONE_GLOBAL_CONFIG_KEY}, ${value}, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      \`value\` = VALUES(\`value\`),
      \`updated_at\` = CURRENT_TIMESTAMP(3)
  `;

  return normalized;
}
