import { NextRequest, NextResponse } from 'next/server';
import {
  listStages,
  getStage,
  createStage,
  updateStage,
  deleteStageWithRelatedData,
  getFirstSlideByStages,
} from '@/lib/db';

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
    return NextResponse.json({ error: 'Failed to process stage' }, { status: 500 });
  }
}
