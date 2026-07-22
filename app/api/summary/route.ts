import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { getCourseSummary } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const stageId = searchParams.get('stageId');

    if (!stageId) {
      return NextResponse.json({ error: 'Missing stageId' }, { status: 400 });
    }

    const summary = await getCourseSummary(session.user.id, stageId);

    if (!summary) {
      return NextResponse.json(null);
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Failed to get course summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
