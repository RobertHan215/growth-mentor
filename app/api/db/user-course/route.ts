import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { enrollCourse, getEnrolledStages } from '@/lib/db';

/**
 * GET /api/db/user-course — Get enrolled courses for current user
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allEnrolled = await getEnrolledStages(session.user.id);
    return NextResponse.json({ success: true, data: allEnrolled });
  } catch (error) {
    console.error('[user-course] GET error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/db/user-course — Enroll in a course
 * Body: { action: 'enroll', data: { stageId, source? } }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, data } = body;

    if (action === 'enroll') {
      const { stageId, source } = data;
      if (!stageId) {
        return NextResponse.json({ error: 'stageId is required' }, { status: 400 });
      }
      await enrollCourse(session.user.id, stageId, source ?? 'self_selected');
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[user-course] POST error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
