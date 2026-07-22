import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { OneOnOneScoringCriteria } from '@/lib/types/one-on-one-scoring';
import {
  assertValidScoringCriteria,
  normalizeScoringCriteria,
} from '@/lib/training/one-on-one-scoring-config';

interface ScoringConfigTag {
  id: string;
  name: string;
  color: string | null;
}

interface ScoringConfigRow {
  id: string;
  tagId: string;
  name: string;
  description: string | null;
  criteria: unknown;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  tag?: ScoringConfigTag;
}

export interface OneOnOneScoringConfigRecord {
  id: string;
  tagId: string;
  name: string;
  description: string | null;
  criteria: OneOnOneScoringCriteria;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  tag?: ScoringConfigTag;
}

interface SaveOneOnOneScoringConfigInput {
  tagId: string;
  name: string;
  description?: string | null;
  criteria: unknown;
  enabled?: boolean;
}

interface UpdateOneOnOneScoringConfigInput {
  tagId?: string;
  name: string;
  description?: string | null;
  criteria: unknown;
  enabled?: boolean;
}

const includeTag = {
  tag: {
    select: {
      id: true,
      name: true,
      color: true,
    },
  },
} as const;

function toRecord(row: ScoringConfigRow): OneOnOneScoringConfigRecord {
  return {
    id: row.id,
    tagId: row.tagId,
    name: row.name,
    description: row.description,
    criteria: normalizeScoringCriteria(row.criteria),
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.tag ? { tag: row.tag } : {}),
  };
}

function normalizeAndValidateCriteria(criteriaInput: unknown): OneOnOneScoringCriteria {
  const criteria = normalizeScoringCriteria(criteriaInput);
  assertValidScoringCriteria(criteria);
  return criteria;
}

export async function listOneOnOneScoringConfigs(): Promise<OneOnOneScoringConfigRecord[]> {
  const configs = await prisma.oneOnOneScoringConfig.findMany({
    include: includeTag,
    orderBy: { createdAt: 'desc' },
  });
  return configs.map(toRecord);
}

export async function getOneOnOneScoringConfigByTag(
  tagId: string,
): Promise<OneOnOneScoringConfigRecord | null> {
  const config = await prisma.oneOnOneScoringConfig.findUnique({
    where: { tagId },
    include: includeTag,
  });
  return config ? toRecord(config) : null;
}

function cleanKeywords(str: string): string[] {
  const stopWords = ['场景', '评分', '配置', '模板', '课', '对练', '实战', '能力', '通用', '默认'];
  let cleanStr = str;
  stopWords.forEach((word) => {
    cleanStr = cleanStr.replaceAll(word, '');
  });
  return cleanStr
    .split(/[\s,_.\-\|()（）]+/)
    .map((k) => k.trim())
    .filter((k) => k.length >= 2);
}

export async function getEnabledScoringConfigForStage(
  stageId: string,
): Promise<OneOnOneScoringConfigRecord | null> {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    select: {
      oneOnOneTagId: true,
      name: true,
      description: true,
      stageTags: {
        select: {
          tagId: true,
        },
      },
    },
  });

  if (!stage) {
    return null;
  }

  // 1. 第一级：优先使用专属绑定的评分配置
  if (stage.oneOnOneTagId) {
    const config = await prisma.oneOnOneScoringConfig.findFirst({
      where: {
        tagId: stage.oneOnOneTagId,
        enabled: true,
      },
      include: includeTag,
    });
    if (config) {
      return toRecord(config);
    }
  }

  // 2. 第二级：使用课程绑定的普通标签匹配已启用配置
  const normalTagIds = stage.stageTags.map((st) => st.tagId).filter(Boolean);
  if (normalTagIds.length > 0) {
    const config = await prisma.oneOnOneScoringConfig.findFirst({
      where: {
        tagId: { in: normalTagIds },
        enabled: true,
      },
      include: includeTag,
    });
    if (config) {
      return toRecord(config);
    }
  }

  // 获取所有已启用的配置供模糊匹配和最后兜底
  const allEnabledConfigs = await prisma.oneOnOneScoringConfig.findMany({
    where: { enabled: true },
    include: includeTag,
  });

  // 3. 第三级：关键词智能模糊匹配
  const searchText = `${stage.name || ''} ${stage.description || ''}`.toLowerCase();
  for (const config of allEnabledConfigs) {
    const keywords: string[] = [];
    if (config.tag?.name) {
      keywords.push(...cleanKeywords(config.tag.name));
    }
    keywords.push(...cleanKeywords(config.name));

    const uniqueKeywords = Array.from(new Set(keywords));
    const matched = uniqueKeywords.some((kw) => searchText.includes(kw.toLowerCase()));
    if (matched) {
      return toRecord(config);
    }
  }

  // 4. 第四级：兜底寻找默认/通用评分配置
  const fallbackConfig = allEnabledConfigs.find(
    (config) => config.tag?.name && ['默认评分', '通用'].includes(config.tag.name),
  );

  return fallbackConfig ? toRecord(fallbackConfig) : null;
}

export async function createOneOnOneScoringConfig(
  input: SaveOneOnOneScoringConfigInput,
): Promise<OneOnOneScoringConfigRecord> {
  const criteria = normalizeAndValidateCriteria(input.criteria);
  const config = await prisma.oneOnOneScoringConfig.create({
    data: {
      tagId: input.tagId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      criteria: criteria as unknown as Prisma.InputJsonValue,
      enabled: input.enabled ?? true,
    },
    include: includeTag,
  });
  return toRecord(config);
}

export async function updateOneOnOneScoringConfig(
  id: string,
  input: UpdateOneOnOneScoringConfigInput,
): Promise<OneOnOneScoringConfigRecord> {
  const criteria = normalizeAndValidateCriteria(input.criteria);
  const data: Parameters<typeof prisma.oneOnOneScoringConfig.update>[0]['data'] = {
    ...(input.tagId !== undefined ? { tagId: input.tagId } : {}),
    name: input.name.trim(),
    criteria: criteria as unknown as Prisma.InputJsonValue,
  };

  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }

  if (input.enabled !== undefined) {
    data.enabled = input.enabled;
  }

  const config = await prisma.oneOnOneScoringConfig.update({
    where: { id },
    data,
    include: includeTag,
  });
  return toRecord(config);
}

export async function deleteOneOnOneScoringConfig(id: string): Promise<void> {
  await prisma.oneOnOneScoringConfig.delete({
    where: { id },
  });
}
