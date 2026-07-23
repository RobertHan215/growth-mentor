import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { deriveLearningMode } from '@/lib/training/course-learning-mode';

type LearningModeInput = Parameters<typeof deriveLearningMode>[0];

function modeConfigFromStage(stage: {
  learningMode: string;
  directorConfig?: Prisma.JsonValue | null;
}): LearningModeInput {
  return {
    learningMode: stage.learningMode,
    directorConfig: stage.directorConfig as LearningModeInput,
  };
}

/**
 * GET /api/training/my-summary — Get training summary grouped by course
 *
 * Merges:
 * - oneOnOne: TrainingResult (scores / attempts)
 * - teaching: UserCourse enrollment (+ CourseSummary completion)
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const [results, userCourses, summaries] = await Promise.all([
      prisma.trainingResult.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          stage: {
            select: { id: true, name: true, learningMode: true, directorConfig: true },
          },
        },
      }),
      prisma.userCourse.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          stage: {
            select: { id: true, name: true, learningMode: true, directorConfig: true },
          },
        },
      }),
      prisma.courseSummary.findMany({
        where: { userId },
        select: { stageId: true },
      }),
    ]);

    const summaryStageIds = new Set(summaries.map((s) => s.stageId));

    // Group one-on-one results by stageId
    const oneOnOneMap = new Map<
      string,
      {
        stageId: string;
        stageName: string;
        scores: number[];
        lastTrainedAt: string;
      }
    >();

    for (const r of results) {
      const key = r.stageId;
      if (!oneOnOneMap.has(key)) {
        oneOnOneMap.set(key, {
          stageId: r.stageId,
          stageName: r.stage.name,
          scores: [],
          lastTrainedAt: r.createdAt.toISOString(),
        });
      }
      oneOnOneMap.get(key)!.scores.push(r.totalScore);
    }

    const oneOnOneCourses = Array.from(oneOnOneMap.values()).map((c) => ({
      stageId: c.stageId,
      stageName: c.stageName,
      learningMode: 'oneOnOne' as const,
      totalAttempts: c.scores.length,
      bestScore: Math.max(...c.scores),
      latestScore: c.scores[0],
      avgScore: Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length),
      lastTrainedAt: c.lastTrainedAt,
      status: null as string | null,
      hasSummary: false,
    }));

    // Teaching enrollments (skip stages that are actually oneOnOne-only)
    const teachingCourses = userCourses.flatMap((uc) => {
      const derivedMode = deriveLearningMode(modeConfigFromStage(uc.stage));
      if (derivedMode !== 'teaching') return [];

      const hasSummary = summaryStageIds.has(uc.stageId);
      const status = hasSummary || uc.status === 'completed' ? 'completed' : uc.status;

      return [
        {
          stageId: uc.stageId,
          stageName: uc.stage.name,
          learningMode: 'teaching' as const,
          totalAttempts: 0,
          bestScore: null as number | null,
          latestScore: null as number | null,
          avgScore: null as number | null,
          lastTrainedAt: uc.updatedAt.toISOString(),
          status,
          hasSummary,
        },
      ];
    });

    const courses = [...oneOnOneCourses, ...teachingCourses];
    courses.sort(
      (a, b) => new Date(b.lastTrainedAt).getTime() - new Date(a.lastTrainedAt).getTime(),
    );

    return NextResponse.json({ courses });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
