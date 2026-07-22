import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.toLowerCase() || '';

    // Build user name filter condition
    const userNameFilter = search
      ? { name: { contains: search } }
      : {};

    // Fetch all users who have at least one UserCourse or TrainingResult
    const users = await prisma.user.findMany({
      where: {
        ...userNameFilter,
        OR: [
          { userCourses: { some: {} } },
          { trainingResults: { some: {} } },
        ],
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        userCourses: {
          select: {
            stageId: true,
            updatedAt: true,
          },
        },
        trainingResults: {
          select: {
            stageId: true,
            totalScore: true,
            createdAt: true,
          },
        },
      },
    });

    // Aggregate per-user stats
    const result = users.map((user) => {
      // Distinct stages from both UserCourse and TrainingResult
      const stageIds = new Set<string>();
      for (const uc of user.userCourses) {
        stageIds.add(uc.stageId);
      }
      for (const tr of user.trainingResults) {
        stageIds.add(tr.stageId);
      }

      // Average totalScore from TrainingResult
      const avgScore =
        user.trainingResults.length > 0
          ? Math.round(
              user.trainingResults.reduce((sum, tr) => sum + tr.totalScore, 0) /
                user.trainingResults.length,
            )
          : null;

      // Most recent timestamp from either UserCourse.updatedAt or TrainingResult.createdAt
      let lastActive: Date | null = null;
      for (const uc of user.userCourses) {
        if (!lastActive || uc.updatedAt > lastActive) {
          lastActive = uc.updatedAt;
        }
      }
      for (const tr of user.trainingResults) {
        if (!lastActive || tr.createdAt > lastActive) {
          lastActive = tr.createdAt;
        }
      }

      return {
        userId: user.id,
        userName: user.name || '未知用户',
        userAvatar: user.avatar,
        courseCount: stageIds.size,
        avgScore,
        lastActive: lastActive?.toISOString() ?? null,
      };
    });

    // Sort by lastActive descending
    result.sort((a, b) => {
      if (!a.lastActive && !b.lastActive) return 0;
      if (!a.lastActive) return 1;
      if (!b.lastActive) return -1;
      return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
    });

    return NextResponse.json({ users: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
