import { NextRequest, NextResponse } from 'next/server';
import { saveStageOutlines, getStageOutlines, deleteStageOutlines } from '@/lib/db';

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
    const stageId = searchParams.get('stageId');

    if (!stageId) {
      apiLog('outlines', 'GET', url, null, 400, Date.now() - start);
      return NextResponse.json({ error: 'Missing stageId' }, { status: 400 });
    }

    const outlines = await getStageOutlines(stageId);
    apiLog('outlines', 'GET', url, { stageId }, 200, Date.now() - start);
    return NextResponse.json({ success: true, data: outlines });
  } catch (error) {
    apiLog('outlines', 'GET', url, null, 500, Date.now() - start);
    console.error('Outlines API error:', error);
    return NextResponse.json({ error: 'Failed to get outlines' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const url = request.url;
  try {
    const body = await request.json();
    const { action, data } = body;
    apiLog('outlines', 'POST', url, { action, data }, 0, 0);

    if (action === 'save') {
      await saveStageOutlines(data);
      apiLog('outlines', 'POST', url, { action, data }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      await deleteStageOutlines(data.stageId);
      apiLog('outlines', 'POST', url, { action, data }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    apiLog('outlines', 'POST', url, { action, data }, 400, Date.now() - start);
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    apiLog('outlines', 'POST', url, null, 500, Date.now() - start);
    console.error('Outlines API error:', error);
    return NextResponse.json({ error: 'Failed to process outlines' }, { status: 500 });
  }
}
