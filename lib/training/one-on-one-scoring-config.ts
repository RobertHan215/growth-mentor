import type { DimensionScore } from '@/lib/types/training';
import type {
  DetailScoreInput,
  FlattenedScoringDetail,
  OneOnOneScoringCriteria,
  ScoringMode,
  ScoringResultSnapshot,
} from '@/lib/types/one-on-one-scoring';

type UnknownRecord = Record<string, unknown>;

interface BuildScoringResultSnapshotParams {
  configId: string;
  configName: string;
  tagId: string;
  criteria: OneOnOneScoringCriteria;
  detailScores: DetailScoreInput[];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textFrom(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function weightFrom(value: unknown): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return 1;
  }
  return Math.max(1, Math.round(numberValue));
}

function scoringModeFrom(value: unknown): ScoringMode {
  return value === 'deduction' ? 'deduction' : 'bonus';
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function scoreFrom(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return Number.NaN;
  }

  const score = Number(value);
  return Number.isFinite(score) ? score : Number.NaN;
}

function clampPositiveDelta(score: unknown, maxScore: number): number {
  const parsed = scoreFrom(score);
  const rounded = Number.isFinite(parsed) ? Math.round(parsed) : 0;
  return Math.min(Math.max(rounded, 0), maxScore);
}

function scoreAmountFrom(detailScore: DetailScoreInput | undefined, maxScore: number): number {
  if (!detailScore) {
    return 0;
  }

  if (detailScore.score !== undefined) {
    return clampPositiveDelta(detailScore.score, maxScore);
  }

  const legacyDelta = scoreFrom(detailScore.scoreDelta);
  return Number.isFinite(legacyDelta) ? clampPositiveDelta(Math.abs(legacyDelta), maxScore) : 0;
}

export function normalizeScoringCriteria(value: unknown): OneOnOneScoringCriteria {
  const criteria = isRecord(value) ? value : {};
  const fallbackScoringMode = scoringModeFrom(criteria.scoringMode);
  const primary = arrayFrom(criteria.primary).map((primaryValue, primaryIndex) => {
    const primaryRecord = isRecord(primaryValue) ? primaryValue : {};
    return {
      id: textFrom(primaryRecord.id, `primary-${primaryIndex + 1}`),
      name: textFrom(primaryRecord.name, `一级指标 ${primaryIndex + 1}`),
      scoringMode: scoringModeFrom(primaryRecord.scoringMode ?? fallbackScoringMode),
      weight: weightFrom(primaryRecord.weight),
      children: arrayFrom(primaryRecord.children).map((secondaryValue, secondaryIndex) => {
        const secondaryRecord = isRecord(secondaryValue) ? secondaryValue : {};
        return {
          id: textFrom(secondaryRecord.id, `secondary-${primaryIndex + 1}-${secondaryIndex + 1}`),
          name: textFrom(secondaryRecord.name, `二级指标 ${secondaryIndex + 1}`),
          weight: weightFrom(secondaryRecord.weight),
          details: arrayFrom(secondaryRecord.details).map((detailValue, detailIndex) => {
            const detailRecord = isRecord(detailValue) ? detailValue : {};
            return {
              id: textFrom(detailRecord.id, `detail-${primaryIndex + 1}-${secondaryIndex + 1}-${detailIndex + 1}`),
              name: textFrom(detailRecord.name, `指标明细 ${detailIndex + 1}`),
              weight: weightFrom(detailRecord.weight),
              description: textFrom(detailRecord.description, ''),
            };
          }),
        };
      }),
    };
  });

  return { version: 1, scoringMode: fallbackScoringMode, primary };
}

export function validateScoringCriteria(criteria: OneOnOneScoringCriteria): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const primaryTotal = sum(criteria.primary.map((primary) => primary.weight));

  if (primaryTotal !== 100) {
    errors.push(`一级指标权重合计必须等于 100，当前为 ${primaryTotal}`);
  }

  criteria.primary.forEach((primary) => {
    if (primary.weight <= 0) {
      errors.push(`${primary.name} 的权重必须大于 0`);
    }

    const secondaryTotal = sum(primary.children.map((secondary) => secondary.weight));
    if (secondaryTotal !== primary.weight) {
      errors.push(`${primary.name} 的二级指标权重合计必须等于 ${primary.weight}，当前为 ${secondaryTotal}`);
    }

    primary.children.forEach((secondary) => {
      if (secondary.weight <= 0) {
        errors.push(`${secondary.name} 的权重必须大于 0`);
      }

      const detailTotal = sum(secondary.details.map((detail) => detail.weight));
      if (detailTotal !== secondary.weight) {
        errors.push(`${secondary.name} 的指标明细权重合计必须等于 ${secondary.weight}，当前为 ${detailTotal}`);
      }

      secondary.details.forEach((detail) => {
        if (detail.weight <= 0) {
          errors.push(`${detail.name} 的权重必须大于 0`);
        }
      });
    });
  });

  return { valid: errors.length === 0, errors };
}

export function assertValidScoringCriteria(criteria: OneOnOneScoringCriteria): void {
  const result = validateScoringCriteria(criteria);
  if (!result.valid) {
    throw new Error(result.errors.join('\n'));
  }
}

export function flattenScoringCriteria(criteria: OneOnOneScoringCriteria): FlattenedScoringDetail[] {
  const fallbackScoringMode = scoringModeFrom(criteria.scoringMode);
  return criteria.primary.flatMap((primary) =>
    primary.children.flatMap((secondary) =>
      secondary.details.map((detail) => ({
        primaryId: primary.id,
        primaryName: primary.name,
        scoringMode: scoringModeFrom(primary.scoringMode ?? fallbackScoringMode),
        secondaryId: secondary.id,
        secondaryName: secondary.name,
        detailId: detail.id,
        detailName: detail.name,
        maxScore: detail.weight,
        description: detail.description,
      })),
    ),
  );
}

export function buildScoringResultSnapshot({
  configId,
  configName,
  tagId,
  criteria,
  detailScores,
}: BuildScoringResultSnapshotParams): { scoreTree: ScoringResultSnapshot; scores: DimensionScore[] } {
  const detailScoreById = new Map(detailScores.map((detailScore) => [detailScore.detailId, detailScore]));
  const fallbackScoringMode = scoringModeFrom(criteria.scoringMode);

  const primary = criteria.primary.map((primaryCriterion) => {
    const scoringMode = scoringModeFrom(primaryCriterion.scoringMode ?? fallbackScoringMode);
    const children = primaryCriterion.children.map((secondaryCriterion) => {
      const details = secondaryCriterion.details.map((detailCriterion) => {
        const detailScore = detailScoreById.get(detailCriterion.id);
        const scoreAmount = detailScore
          ? scoreAmountFrom(detailScore, detailCriterion.weight)
          : (scoringMode === 'deduction' ? detailCriterion.weight : 0);
        // LLM 统一返回表现分（0=最差，maxScore=最好），不区分加分/扣分制
        const score = scoreAmount;
        const deducted = detailCriterion.weight - scoreAmount;
        const delta = scoringMode === 'deduction'
          ? (deducted > 0 ? -deducted : 0)
          : (scoreAmount > 0 ? scoreAmount : 0);
        const reason = textFrom(detailScore?.reason, '');
        return {
          id: detailCriterion.id,
          name: detailCriterion.name,
          score,
          maxScore: detailCriterion.weight,
          delta,
          type: delta > 0 ? 'awarded' as const : delta < 0 ? 'deducted' as const : 'no_change' as const,
          reason,
          evidence: textFrom(detailScore?.evidence, ''),
          feedback: reason || 'AI 未返回该项评分',
        };
      });

      return {
        id: secondaryCriterion.id,
        name: secondaryCriterion.name,
        score: sum(details.map((detail) => detail.score)),
        maxScore: secondaryCriterion.weight,
        delta: sum(details.map((detail) => detail.delta)),
        details,
      };
    });

    return {
      id: primaryCriterion.id,
      name: primaryCriterion.name,
      scoringMode,
      score: sum(children.map((secondary) => secondary.score)),
      maxScore: primaryCriterion.weight,
      delta: sum(children.map((secondary) => secondary.delta)),
      children,
    };
  });

  const scoreTree: ScoringResultSnapshot = {
    configId,
    configName,
    tagId,
    scoringMode: fallbackScoringMode,
    totalScore: sum(primary.map((primaryScore) => primaryScore.score)),
    maxScore: 100,
    primary,
  };

  const scores = primary.map((primaryScore) => ({
    dimensionId: primaryScore.id,
    dimensionName: primaryScore.name,
    score: primaryScore.maxScore > 0 ? Math.round((primaryScore.score / primaryScore.maxScore) * 100) : 0,
    feedback: `${primaryScore.score}/${primaryScore.maxScore}`,
  }));

  return { scoreTree, scores };
}
