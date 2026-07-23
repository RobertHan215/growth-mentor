import { NextRequest, NextResponse } from 'next/server';
import {
  listStages,
  getStage,
  createStage,
  updateStage,
  deleteStageWithRelatedData,
  getFirstSlideByStages,
} from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { checkCourseVisibility } from '@/lib/server/course-visibility';

function apiLog(
  name: string,
  method: string,
  url: string,
  body: unknown,
  status: number,
  ms: number,
) {
  const bodyStr = body ? `IN=${JSON.stringify(body)}` : '';
  console.log(`[API] ${name} ${method} ${url} ${status} ${ms}ms ${bodyStr}`);
}

export async function GET(request: NextRequest) {
  const start = Date.now();
  const url = request.url;
  try {
    const { searchParams } = new URL(url);
    const userId = searchParams.get('userId');
    const stageId = searchParams.get('stageId');
    const stageIds = searchParams.get('stageIds');
    const params = { userId, stageId, stageIds };

    if (stageIds) {
      const ids = stageIds.split(',');
      const result = await getFirstSlideByStages(ids);
      apiLog('stage', 'GET', url, params, 200, Date.now() - start);
      return NextResponse.json({ success: true, data: result });
    }

    if (stageId) {
      const stage = await getStage(stageId);

      // Visibility check: query raw Prisma record for visibility fields
      // (StageRecord doesn't include isPublished/visibilityRoles/visibilityUsers)
      if (stage) {
        const { prisma: db } = await import('@/lib/db');
        const rawStage = await db.stage.findUnique({
          where: { id: stageId },
          select: { isPublished: true, visibilityRoles: true, visibilityUsers: true },
        });

        if (rawStage) {
          const session = await getServerSession(authOptions);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sessionUser = session?.user as any;
          const user = sessionUser
            ? { id: sessionUser.id as string, role: (sessionUser.role as string) || 'user' }
            : null;

          // Admin always passes; non-admin check visibility
          if (!user || user.role !== 'admin') {
            const canAccess = user
              ? checkCourseVisibility(rawStage, user)
              : rawStage.isPublished && !rawStage.visibilityRoles && !rawStage.visibilityUsers;
            if (!canAccess) {
              apiLog('stage', 'GET', url, params, 403, Date.now() - start);
              return NextResponse.json({ error: 'No permission to access this course' }, { status: 403 });
            }
          }
        }
      }

      apiLog('stage', 'GET', url, params, 200, Date.now() - start);
      return NextResponse.json({ success: true, data: stage });
    }

    if (userId) {
      const stages = await listStages(userId);
      apiLog('stage', 'GET', url, params, 200, Date.now() - start);
      return NextResponse.json({ success: true, data: stages });
    }

    apiLog('stage', 'GET', url, params, 400, Date.now() - start);
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  } catch (error) {
    apiLog('stage', 'GET', url, null, 500, Date.now() - start);
    console.error('Stage API error:', error);
    return NextResponse.json({ error: 'Failed to get stages' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const url = request.url;
  try {
    const body = await request.json();
    const { action, data } = body;
    apiLog('stage', 'POST', url, { action, data }, 0, 0);

    if (action === 'create') {
      await createStage(data);
      apiLog('stage', 'POST', url, { action, data }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    if (action === 'update') {
      const { id: stageId, ...fields } = data;
      await updateStage(stageId, fields);
      apiLog('stage', 'POST', url, { action, data }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      await deleteStageWithRelatedData(data.stageId || data.id);
      apiLog('stage', 'POST', url, { action, data }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    apiLog('stage', 'POST', url, { action, data }, 400, Date.now() - start);
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    apiLog('stage', 'POST', url, null, 500, Date.now() - start);
    console.error('Stage API error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process stage';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
