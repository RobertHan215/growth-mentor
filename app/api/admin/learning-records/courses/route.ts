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

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.toLowerCase() || '';

    // Build where clause for stages with at least one learning record
    const stageWhere: Prisma.StageWhereInput = {
      OR: [
        { userCourses: { some: {} } },
        { trainingResults: { some: {} } },
      ],
    };
    if (search) {
      stageWhere.name = { contains: search };
    }

    // Fetch all stages that have at least one UserCourse or TrainingResult
    const stages = await prisma.stage.findMany({
      where: stageWhere,
      select: {
        id: true,
        name: true,
        learningMode: true,
        directorConfig: true,
        coverImage: true,
        userCourses: {
          select: {
            userId: true,
            updatedAt: true,
          },
        },
        trainingResults: {
          select: {
            userId: true,
            totalScore: true,
            createdAt: true,
          },
        },
      },
    });

    // Aggregate per-course stats
    const courses = stages
      .map((stage) => {
        // Collect distinct user IDs from both UserCourse and TrainingResult
        const userIds = new Set<string>();
        for (const uc of stage.userCourses) {
          userIds.add(uc.userId);
        }
        for (const tr of stage.trainingResults) {
          userIds.add(tr.userId);
        }

        // Calculate average score from TrainingResult
        let avgScore: number | null = null;
        if (stage.trainingResults.length > 0) {
          const total = stage.trainingResults.reduce(
            (sum, tr) => sum + (tr.totalScore ?? 0),
            0,
          );
          avgScore = Math.round(total / stage.trainingResults.length);
        }

        // Determine last active timestamp
        const timestamps: Date[] = [];
        for (const uc of stage.userCourses) {
          timestamps.push(uc.updatedAt);
        }
        for (const tr of stage.trainingResults) {
          timestamps.push(tr.createdAt);
        }
        const lastActive =
          timestamps.length > 0
            ? new Date(Math.max(...timestamps.map((t) => t.getTime())))
            : null;

        return {
          stageId: stage.id,
          stageName: stage.name,
          learningMode: deriveLearningMode(modeConfigFromStage(stage)),
          coverImage: stage.coverImage,
          userCount: userIds.size,
          avgScore,
          lastActive: lastActive?.toISOString() ?? null,
        };
      })
      // Sort by lastActive descending
      .sort((a, b) => {
        if (!a.lastActive && !b.lastActive) return 0;
        if (!a.lastActive) return 1;
        if (!b.lastActive) return -1;
        return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
      });

    return NextResponse.json({ courses });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
