import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import {
  buildRealSpeechReferencePrompt,
  buildDynamicSpeechRetrievalPlan,
  scoreSpeechSampleForContext,
} from '@/lib/training/real-speech-library';

interface RetrieveRealSpeechPromptParams {
  templateId?: string | null;
  latestUserText: string;
  roundCount: number;
  recentMessages?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  limit?: number;
}

export interface RealSpeechRetrievalResult {
  prompt: string;
  debug: {
    enabled: boolean;
    reason?: string;
    templateId?: string | null;
    latestUserText: string;
    roundCount: number;
    retrievalPlan?: ReturnType<typeof buildDynamicSpeechRetrievalPlan>;
    candidateCount: number;
    retrievalMode?:
      | 'dynamic_strict'
      | 'dynamic_strict_with_fuzzy'
      | 'dynamic_fuzzy'
      | 'dynamic_fallback_template_samples';
    selectionMode?: 'score_filtered' | 'low_score_fallback';
    boundEnabledSampleCount?: number;
    selectedCount: number;
    selectedSamples: Array<{
      id: string;
      score: number;
      triggerAction: string;
      customerIntent: string;
      strategy: string;
      emotion: string;
      collectorPrompt: string;
      sanitizedCustomerLine: string;
      qualityScore: number;
      usageCount: number;
    }>;
    promptPreview: string;
  };
}

function mergeUniqueSamples<T extends { id: string }>(...groups: T[][]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const group of groups) {
    for (const sample of group) {
      if (seen.has(sample.id)) continue;
      seen.add(sample.id);
      merged.push(sample);
    }
  }

  return merged;
}

function diversifySamples<T extends { sample: { customerIntent: string; strategy: string } }>(
  samples: T[],
  limit: number,
): T[] {
  const selected: T[] = [];
  const intentCount = new Map<string, number>();
  const strategyCount = new Map<string, number>();

  for (const sample of samples) {
    const intentUsed = intentCount.get(sample.sample.customerIntent) || 0;
    const strategyUsed = strategyCount.get(sample.sample.strategy) || 0;
    if (intentUsed >= 2 || strategyUsed >= 2) continue;

    selected.push(sample);
    intentCount.set(sample.sample.customerIntent, intentUsed + 1);
    strategyCount.set(sample.sample.strategy, strategyUsed + 1);

    if (selected.length >= limit) break;
  }

  if (selected.length >= Math.min(3, limit)) return selected;

  for (const sample of samples) {
    if (selected.includes(sample)) continue;
    selected.push(sample);
    if (selected.length >= limit) break;
  }

  return selected;
}

export async function retrieveRealSpeechPrompt({
  templateId,
  latestUserText,
  roundCount,
  recentMessages,
  limit,
}: RetrieveRealSpeechPromptParams): Promise<RealSpeechRetrievalResult> {
  const baseDebug = {
    templateId,
    latestUserText,
    roundCount,
    candidateCount: 0,
    selectedCount: 0,
    selectedSamples: [],
    promptPreview: '',
  };

  if (!templateId) {
    return {
      prompt: '',
      debug: {
        ...baseDebug,
        enabled: false,
        reason: 'missing_selected_template_id',
      },
    };
  }

  if (!latestUserText.trim()) {
    return {
      prompt: '',
      debug: {
        ...baseDebug,
        enabled: false,
        reason: 'empty_latest_user_text',
      },
    };
  }

  const retrievalPlan = buildDynamicSpeechRetrievalPlan({
    latestUserText,
    roundCount,
    recentAssistantTexts: recentMessages
      ?.filter((message) => message.role === 'assistant')
      .map((message) => message.content),
    maxLimit: limit,
  });
  const context = retrievalPlan.context;

  const strictOrConditions: Prisma.CustomerSpeechSampleWhereInput[] = [
    { triggerAction: context.triggerAction },
    { customerIntent: { in: context.expectedCustomerIntents } },
    { strategy: { in: context.expectedStrategies } },
    { qualityScore: { gte: retrievalPlan.broadQualityThreshold } },
  ];

  if (context.pressureLevel !== '中') {
    strictOrConditions.push({ pressureLevel: context.pressureLevel });
  }

  if (context.dialogueStage !== '中段推进') {
    strictOrConditions.push({ dialogueStage: context.dialogueStage });
  }

  const strictCandidates = await prisma.customerSpeechSample.findMany({
    where: {
      enabled: true,
      templateBindings: {
        some: { templateId },
      },
      OR: strictOrConditions,
    },
    orderBy: [{ qualityScore: 'desc' }, { usageCount: 'asc' }],
    take: retrievalPlan.strictTake,
  });

  const fuzzyTextConditions: Prisma.CustomerSpeechSampleWhereInput[] =
    retrievalPlan.fuzzyTerms.flatMap((term) => [
      { collectorPrompt: { contains: term } },
      { customerLine: { contains: term } },
      { sanitizedCustomerLine: { contains: term } },
    ]);

  const fuzzyCandidates =
    fuzzyTextConditions.length > 0
      ? await prisma.customerSpeechSample.findMany({
          where: {
            enabled: true,
            templateBindings: {
              some: { templateId },
            },
            OR: fuzzyTextConditions,
          },
          orderBy: [{ qualityScore: 'desc' }, { usageCount: 'asc' }],
          take: retrievalPlan.fuzzyTake,
        })
      : [];

  let candidates = mergeUniqueSamples(strictCandidates, fuzzyCandidates);
  if (candidates.length === 0 && fuzzyCandidates.length > 0) {
    candidates = fuzzyCandidates;
  }
  if (candidates.length === 0) {
    candidates = await prisma.customerSpeechSample.findMany({
      where: {
        enabled: true,
        templateBindings: {
          some: { templateId },
        },
      },
      orderBy: [{ qualityScore: 'desc' }, { usageCount: 'asc' }],
      take: retrievalPlan.fallbackTake,
    });
  }

  if (candidates.length === 0) {
    return {
      prompt: '',
      debug: {
        ...baseDebug,
        enabled: true,
        reason: 'no_candidates',
        retrievalPlan,
        retrievalMode: 'dynamic_strict',
        boundEnabledSampleCount: 0,
      },
    };
  }

  const retrievalMode =
    strictCandidates.length > 0
      ? fuzzyCandidates.length > 0
        ? 'dynamic_strict_with_fuzzy'
        : 'dynamic_strict'
      : fuzzyCandidates.length > 0
        ? 'dynamic_fuzzy'
        : 'dynamic_fallback_template_samples';

  const ranked = candidates
    .map((sample) => ({
      sample,
      score: scoreSpeechSampleForContext(sample, context, {
        latestCollectorText: latestUserText,
        fuzzyTerms: retrievalPlan.fuzzyTerms,
        recentCustomerIntents: retrievalPlan.recentCustomerIntents,
        recentStrategies: retrievalPlan.recentStrategies,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const scoreFilteredRanked = ranked.filter(({ score }) => score >= retrievalPlan.minimumScore);
  const selectionMode = scoreFilteredRanked.length > 0 ? 'score_filtered' : 'low_score_fallback';
  const selectableRanked =
    scoreFilteredRanked.length > 0 || !retrievalPlan.allowFallback
      ? scoreFilteredRanked
      : ranked.slice(0, Math.max(retrievalPlan.limit, 2));
  const selectedRanked = diversifySamples(selectableRanked, retrievalPlan.limit);
  if (selectedRanked.length === 0) {
    return {
      prompt: '',
      debug: {
        ...baseDebug,
        enabled: true,
        reason: 'no_selected_samples',
        retrievalPlan,
        candidateCount: candidates.length,
        retrievalMode,
        selectionMode,
        boundEnabledSampleCount: candidates.length,
      },
    };
  }

  const selected = selectedRanked.map(({ sample }) => sample);

  await prisma.customerSpeechSample.updateMany({
    where: { id: { in: selected.map((sample) => sample.id) } },
    data: {
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });

  const profile = await prisma.characterSpeechProfile.findUnique({
    where: { templateId },
  });

  const prompt = buildRealSpeechReferencePrompt({
    context,
    profile,
    samples: selected.map((sample) => ({
      collectorPrompt: sample.collectorPrompt,
      sanitizedCustomerLine: sample.sanitizedCustomerLine,
      customerIntent: sample.customerIntent,
      strategy: sample.strategy,
      emotion: sample.emotion,
    })),
  });

  return {
    prompt,
    debug: {
      ...baseDebug,
      enabled: true,
      retrievalPlan,
      candidateCount: candidates.length,
      retrievalMode,
      selectionMode,
      boundEnabledSampleCount: candidates.length,
      selectedCount: selectedRanked.length,
      selectedSamples: selectedRanked.map(({ sample, score }) => ({
        id: sample.id,
        score: Math.round(score * 10) / 10,
        triggerAction: sample.triggerAction,
        customerIntent: sample.customerIntent,
        strategy: sample.strategy,
        emotion: sample.emotion,
        collectorPrompt: sample.collectorPrompt.slice(0, 120),
        sanitizedCustomerLine: sample.sanitizedCustomerLine.slice(0, 160),
        qualityScore: sample.qualityScore,
        usageCount: sample.usageCount,
      })),
      promptPreview: prompt.slice(0, 4000),
    },
  };
}
