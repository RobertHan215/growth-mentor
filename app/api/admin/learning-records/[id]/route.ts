import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScoringTreeSnapshot(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.primary);
}

function stringArrayFromJson(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'teaching' | 'oneOnOne'

    if (!type) {
      return NextResponse.json({ error: 'Type is required' }, { status: 400 });
    }

    if (type === 'teaching') {
      // id is composite: "userId:stageId"
      const parts = id.split(':');
      if (parts.length !== 2) {
        return NextResponse.json(
          { error: 'Invalid ID format for teaching record' },
          { status: 400 },
        );
      }
      const [userId, stageId] = parts;

      // 1. Fetch user course details
      const userCourse = await prisma.userCourse.findUnique({
        where: {
          userId_stageId: { userId, stageId },
        },
        include: {
          user: {
            select: { id: true, name: true, avatar: true, email: true },
          },
          stage: {
            select: { id: true, name: true, learningMode: true, coverImage: true },
          },
        },
      });

      if (!userCourse) {
        return NextResponse.json({ error: 'Learning record not found' }, { status: 404 });
      }

      // 2. Fetch course summary if any
      const courseSummary = await prisma.courseSummary.findUnique({
        where: {
          userId_stageId: { userId, stageId },
        },
      });

      // 3. Fetch chat sessions associated with classroom learning
      const chatSessions = await prisma.chatSession.findMany({
        where: {
          userId,
          stageId,
          type: { in: ['qa', 'discussion', 'lecture'] },
        },
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          type: true,
          title: true,
          messages: true,
          createdAt: true,
        },
      });

      return NextResponse.json({
        type: 'teaching',
        user: userCourse.user,
        stage: userCourse.stage,
        userCourse: {
          source: userCourse.source,
          status: courseSummary ? 'completed' : userCourse.status,
          createdAt: userCourse.createdAt,
          updatedAt: userCourse.updatedAt,
        },
        courseSummary: courseSummary ? courseSummary.content : null,
        chatSessions,
      });
    } else if (type === 'oneOnOne') {
      // id is training result uuid
      const trainingResult = await prisma.trainingResult.findUnique({
        where: { id },
        include: {
          user: {
            select: { id: true, name: true, avatar: true, email: true },
          },
          stage: {
            select: { id: true, name: true, learningMode: true, coverImage: true },
          },
        },
      });

      if (!trainingResult) {
        return NextResponse.json({ error: 'Training result not found' }, { status: 404 });
      }

      // Fetch the corresponding chat session
      const chatSession = await prisma.chatSession.findUnique({
        where: { id: trainingResult.sessionId },
        select: {
          id: true,
          title: true,
          messages: true,
          createdAt: true,
        },
      });

      return NextResponse.json({
        type: 'oneOnOne',
        user: trainingResult.user,
        stage: trainingResult.stage,
        trainingResult: {
          id: trainingResult.id,
          totalScore: trainingResult.totalScore,
          scores: Array.isArray(trainingResult.scores) ? trainingResult.scores : [],
          scoreTree: isScoringTreeSnapshot(trainingResult.scores)
            ? trainingResult.scores
            : undefined,
          summary: trainingResult.summary,
          highlights: stringArrayFromJson(trainingResult.highlights),
          improvements: stringArrayFromJson(trainingResult.improvements),
          completedObjectives: stringArrayFromJson(trainingResult.objectives),
          rounds: trainingResult.rounds,
          duration: trainingResult.duration,
          difficulty: trainingResult.difficulty,
          createdAt: trainingResult.createdAt,
        },
        chatSession,
      });
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
