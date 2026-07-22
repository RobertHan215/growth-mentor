import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

/**
 * GET /api/training/my-summary — Get training summary grouped by course
 *
 * Returns an array of courses with training stats: attempts, best/latest/avg score.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = await prisma.trainingResult.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        stage: {
          select: { id: true, name: true },
        },
      },
    });

    // Group by stageId
    const courseMap = new Map<string, {
      stageId: string;
      stageName: string;
      scores: number[];
      lastTrainedAt: string;
    }>();

    for (const r of results) {
      const key = r.stageId;
      if (!courseMap.has(key)) {
        courseMap.set(key, {
          stageId: r.stageId,
          stageName: r.stage.name,
          scores: [],
          lastTrainedAt: r.createdAt.toISOString(),
        });
      }
      courseMap.get(key)!.scores.push(r.totalScore);
    }

    const courses = Array.from(courseMap.values()).map((c) => ({
      stageId: c.stageId,
      stageName: c.stageName,
      totalAttempts: c.scores.length,
      bestScore: Math.max(...c.scores),
      latestScore: c.scores[0], // already desc ordered
      avgScore: Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length),
      lastTrainedAt: c.lastTrainedAt,
    }));

    // Sort by last trained
    courses.sort((a, b) => new Date(b.lastTrainedAt).getTime() - new Date(a.lastTrainedAt).getTime());

    return NextResponse.json({ courses });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
