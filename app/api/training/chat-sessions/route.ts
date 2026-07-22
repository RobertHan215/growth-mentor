import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

/**
 * GET /api/training/chat-sessions — Get one-on-one chat sessions for a stage
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const stageId = searchParams.get('stageId');

    if (!stageId) {
      return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
    }

    const sessions = await prisma.chatSession.findMany({
      where: {
        userId: session.user.id,
        stageId,
        type: 'one-on-one',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        config: true,
        messages: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ sessions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
