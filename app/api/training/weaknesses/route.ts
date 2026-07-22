import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { createLogger } from '@/lib/logger';

const log = createLogger('历史不足查询 API');

/**
 * GET /api/training/weaknesses — Get active training weaknesses for a course
 * Query params:
 *   - stageId: course stage ID (required)
 *   - includeResolved: if 'true', also include resolved weaknesses
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const stageId = searchParams.get('stageId');
    const includeResolved = searchParams.get('includeResolved') === 'true';

    if (!stageId) {
      return NextResponse.json(
        { error: 'stageId is required' },
        { status: 400 },
      );
    }

    const where: Record<string, unknown> = {
      userId: session.user.id,
      stageId,
    };
    if (!includeResolved) {
      where.status = 'active';
    }

    const weaknesses = await prisma.trainingWeakness.findMany({
      where,
      orderBy: { firstSeenAt: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        suggestion: true,
        status: true,
        firstSeenAt: true,
        resolvedAt: true,
        sourceResultId: true,
      },
    });

    const sourceResultIds = Array.from(
      new Set(weaknesses.map((w) => w.sourceResultId).filter(Boolean)),
    );

    const [sourceResults, stageResults] =
      sourceResultIds.length > 0
        ? await Promise.all([
            prisma.trainingResult.findMany({
              where: {
                id: { in: sourceResultIds },
                userId: session.user.id,
                stageId,
              },
              select: {
                id: true,
                sessionId: true,
                createdAt: true,
                totalScore: true,
                rounds: true,
                duration: true,
                summary: true,
              },
            }),
            prisma.trainingResult.findMany({
              where: {
                userId: session.user.id,
                stageId,
              },
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
              },
            }),
          ])
        : [[], []];

    const sourceSessionIds = sourceResults.map((result) => result.sessionId);
    const sourceSessions =
      sourceSessionIds.length > 0
        ? await prisma.chatSession.findMany({
            where: {
              id: { in: sourceSessionIds },
              userId: session.user.id,
              stageId,
            },
            select: {
              id: true,
              title: true,
            },
          })
        : [];

    const sourceById = new Map(sourceResults.map((result) => [result.id, result]));
    const sessionTitleById = new Map(sourceSessions.map((session) => [session.id, session.title]));
    const attemptNumberByResultId = new Map(
      stageResults.map((result, index) => [result.id, index + 1]),
    );

    const weaknessItems = weaknesses.map((weakness) => {
      const source = sourceById.get(weakness.sourceResultId);
      return {
        ...weakness,
        source: source
          ? {
              resultId: source.id,
              sessionId: source.sessionId,
              title: sessionTitleById.get(source.sessionId) ?? null,
              attemptNumber: attemptNumberByResultId.get(source.id) ?? null,
              createdAt: source.createdAt.toISOString(),
              totalScore: source.totalScore,
              rounds: source.rounds,
              duration: source.duration,
              summary: source.summary,
            }
          : null,
      };
    });

    log.info(
      `[历史不足查询] 用户=${session.user.id} 课程=${stageId} 数量=${weaknesses.length} 含已解决=${includeResolved}`,
    );

    return NextResponse.json({ weaknesses: weaknessItems });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`[历史不足查询] 查询失败 错误=${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
