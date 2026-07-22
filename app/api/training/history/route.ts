import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

/**
 * GET /api/training/history — Get training history with growth data
 * Query params:
 *   - sceneId: specific scene to get history for
 *   - stageId: all scenes in a stage
 *   - limit: max results (default 50)
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sceneId = searchParams.get('sceneId');
    const stageId = searchParams.get('stageId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (!sceneId && !stageId) {
      return NextResponse.json(
        { error: 'Either sceneId or stageId is required' },
        { status: 400 },
      );
    }

    const where: Record<string, string> = { userId: session.user.id };
    if (sceneId) where.sceneId = sceneId;
    if (stageId) where.stageId = stageId;

    const results = await prisma.trainingResult.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    // Compute growth data: compare first and latest scores per dimension
    const growthData = computeGrowthData(results);

    return NextResponse.json({
      results: results.map((result) => ({
        ...result,
        scoreTree: isScoringTreeSnapshot(result.scores) ? result.scores : null,
      })),
      growthData,
      totalAttempts: results.length,
      bestScore: results.length > 0 ? Math.max(...results.map((r) => r.totalScore)) : 0,
      latestScore: results.length > 0 ? results[results.length - 1].totalScore : 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface GrowthDimension {
  dimensionName: string;
  firstScore: number;
  latestScore: number;
  improvement: number; // percentage points
  trend: 'up' | 'down' | 'stable';
  history: number[]; // all scores in chronological order
}

type DimensionScoreSnapshot = { dimensionId: string; dimensionName: string; score: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scorePercent(score: unknown, maxScore: unknown): number {
  if (typeof score !== 'number' || typeof maxScore !== 'number' || maxScore <= 0) {
    return 0;
  }

  return Math.round(Math.min(Math.max((score / maxScore) * 100, 0), 100));
}

function extractDimensionScores(scores: unknown): DimensionScoreSnapshot[] {
  if (Array.isArray(scores)) {
    return scores
      .filter(isRecord)
      .map((score) => ({
        dimensionId: typeof score.dimensionId === 'string' ? score.dimensionId : '',
        dimensionName: typeof score.dimensionName === 'string' ? score.dimensionName : '',
        score: typeof score.score === 'number' ? score.score : Number(score.score) || 0,
      }))
      .filter((score) => score.dimensionName.length > 0);
  }

  if (!isRecord(scores) || !Array.isArray(scores.primary)) {
    return [];
  }

  return scores.primary
    .filter(isRecord)
    .map((primary) => ({
      dimensionId: typeof primary.id === 'string' ? primary.id : '',
      dimensionName: typeof primary.name === 'string' ? primary.name : '',
      score: scorePercent(primary.score, primary.maxScore),
    }))
    .filter((score) => score.dimensionName.length > 0);
}

function isScoringTreeSnapshot(scores: unknown): boolean {
  return isRecord(scores) && Array.isArray(scores.primary);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeGrowthData(results: any[]): GrowthDimension[] {
  if (results.length < 1) return [];

  // Collect all dimension scores across all attempts
  const dimensionMap = new Map<string, { name: string; scores: number[] }>();

  for (const result of results) {
    for (const s of extractDimensionScores(result.scores)) {
      const key = s.dimensionId || s.dimensionName;
      if (!dimensionMap.has(key)) {
        dimensionMap.set(key, { name: s.dimensionName, scores: [] });
      }
      dimensionMap.get(key)!.scores.push(s.score);
    }
  }

  // Build growth data
  const growthData: GrowthDimension[] = [];
  for (const [, data] of dimensionMap) {
    const firstScore = data.scores[0];
    const latestScore = data.scores[data.scores.length - 1];
    const improvement = latestScore - firstScore;

    growthData.push({
      dimensionName: data.name,
      firstScore,
      latestScore,
      improvement,
      trend: improvement > 2 ? 'up' : improvement < -2 ? 'down' : 'stable',
      history: data.scores,
    });
  }

  return growthData;
}
