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
    const mode = searchParams.get('mode'); // 'teaching' | 'oneOnOne'
    const userId = searchParams.get('userId');
    const stageId = searchParams.get('stageId');
    const search = searchParams.get('search')?.toLowerCase() || '';

    const shouldFetchTeaching = !mode || mode === 'teaching';
    const shouldFetchOneOnOne = !mode || mode === 'oneOnOne';

    // Fetch user courses (teaching mode records)
    const userCourses = shouldFetchTeaching
      ? await (async () => {
          const ucWhere: Prisma.UserCourseWhereInput = {};
          if (userId) ucWhere.userId = userId;
          if (stageId) ucWhere.stageId = stageId;

          return prisma.userCourse.findMany({
            where: ucWhere,
            include: {
              user: {
                select: { id: true, name: true, avatar: true },
              },
              stage: {
                select: {
                  id: true,
                  name: true,
                  learningMode: true,
                  directorConfig: true,
                },
              },
            },
            orderBy: {
              updatedAt: 'desc',
            },
          });
        })()
      : [];

    // Fetch training results (oneOnOne mode records)
    const trainingResults = shouldFetchOneOnOne
      ? await (async () => {
          const trWhere: Prisma.TrainingResultWhereInput = {};
          if (userId) trWhere.userId = userId;
          if (stageId) trWhere.stageId = stageId;

          return prisma.trainingResult.findMany({
            where: trWhere,
            include: {
              user: {
                select: { id: true, name: true, avatar: true },
              },
              stage: {
                select: {
                  id: true,
                  name: true,
                  learningMode: true,
                  directorConfig: true,
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          });
        })()
      : [];

    // Get all course summaries to mark completed teaching courses
    const summaries = await prisma.courseSummary.findMany({
      select: {
        userId: true,
        stageId: true,
      },
    });
    const summarySet = new Set(summaries.map((s) => `${s.userId}:${s.stageId}`));

    // Map teaching records
    const teachingRecords = userCourses.flatMap((uc) => {
      const derivedMode = deriveLearningMode(modeConfigFromStage(uc.stage));
      if (derivedMode !== 'teaching') return []; // Skip if it's actually oneOnOne stage

      const isCompleted = summarySet.has(`${uc.userId}:${uc.stageId}`) || uc.status === 'completed';

      return [
        {
          id: `${uc.userId}:${uc.stageId}`,
          type: 'teaching' as const,
          userId: uc.userId,
          userName: uc.user.name || '未知用户',
          userAvatar: uc.user.avatar,
          stageId: uc.stageId,
          stageName: uc.stage.name,
          totalScore: null,
          status: isCompleted ? 'completed' : uc.status,
          createdAt: uc.createdAt.toISOString(),
          updatedAt: uc.updatedAt.toISOString(),
          hasSummary: summarySet.has(`${uc.userId}:${uc.stageId}`),
        },
      ];
    });

    // Map oneOnOne records
    const oneOnOneRecords = trainingResults.map((tr) => {
      return {
        id: tr.id,
        type: 'oneOnOne' as const,
        userId: tr.userId,
        userName: tr.user.name || '未知用户',
        userAvatar: tr.user.avatar,
        stageId: tr.stageId,
        stageName: tr.stage.name,
        totalScore: tr.totalScore,
        status: 'completed',
        createdAt: tr.createdAt.toISOString(),
        updatedAt: tr.createdAt.toISOString(),
        difficulty: tr.difficulty,
        rounds: tr.rounds,
        duration: tr.duration,
      };
    });

    // Merge and filter by search query (user name or stage name)
    let merged = [...teachingRecords, ...oneOnOneRecords];

    if (search) {
      merged = merged.filter(
        (r) =>
          r.userName.toLowerCase().includes(search) || r.stageName.toLowerCase().includes(search),
      );
    }

    // Sort by updatedAt desc
    merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    // Fetch users for dropdown filtering
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Fetch stages for dropdown filtering
    const stages = await prisma.stage.findMany({
      select: {
        id: true,
        name: true,
        learningMode: true,
        directorConfig: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json({
      records: merged,
      filters: {
        users,
        stages: stages.map((s) => ({
          id: s.id,
          name: s.name,
          mode: deriveLearningMode(modeConfigFromStage(s)),
        })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
