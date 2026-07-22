import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

/**
 * GET /api/training — Get training results for current user
 * Query params: stageId, sceneId (optional filters)
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const stageId = searchParams.get('stageId');
    const sceneId = searchParams.get('sceneId');

    const where: Record<string, string> = { userId: session.user.id };
    if (stageId) where.stageId = stageId;
    if (sceneId) where.sceneId = sceneId;

    const results = await prisma.trainingResult.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      results.map((result) => ({
        ...result,
        scoreTree:
          typeof result.scores === 'object' &&
          result.scores !== null &&
          !Array.isArray(result.scores) &&
          Array.isArray((result.scores as { primary?: unknown }).primary)
            ? result.scores
            : null,
      })),
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/training — Save a training result
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      stageId,
      sceneId,
      sessionId,
      difficulty,
      scores,
      scoreTree,
      totalScore,
      summary,
      highlights,
      improvements,
      objectives,
      rounds,
      duration,
    } = body;

    const result = await prisma.trainingResult.create({
      data: {
        userId: session.user.id,
        stageId,
        sceneId,
        sessionId,
        difficulty,
        scores: scoreTree || scores,
        totalScore,
        summary,
        highlights,
        improvements,
        objectives,
        rounds,
        duration,
      },
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
