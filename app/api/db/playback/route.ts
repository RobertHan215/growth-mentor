import { NextRequest, NextResponse } from 'next/server';
import { getPlaybackState, savePlaybackState, deletePlaybackState } from '@/lib/db';

function apiLog(method: string, url: string, status: number, ms: number) {
  console.log(`[API] playback ${method} ${url} ${status} ${ms}ms`);
}

// GET /api/db/playback?stageId=xxx
export async function GET(request: NextRequest) {
  const start = Date.now();
  const url = request.url;
  try {
    const stageId = new URL(url).searchParams.get('stageId');
    if (!stageId) {
      return NextResponse.json({ error: 'Missing stageId' }, { status: 400 });
    }
    const data = await getPlaybackState(stageId);
    apiLog('GET', url, 200, Date.now() - start);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    apiLog('GET', url, 500, Date.now() - start);
    console.error('Playback API GET error:', error);
    return NextResponse.json({ error: 'Failed to get playback state' }, { status: 500 });
  }
}

// POST /api/db/playback  body: { action: 'save'|'delete', data: {...} }
export async function POST(request: NextRequest) {
  const start = Date.now();
  const url = request.url;
  try {
    const body = await request.json();
    const { action, data } = body;

    if (action === 'save') {
      await savePlaybackState(data);
      apiLog('POST', url, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      await deletePlaybackState(data.stageId);
      apiLog('POST', url, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    apiLog('POST', url, 500, Date.now() - start);
    console.error('Playback API POST error:', error);
    return NextResponse.json({ error: 'Failed to process playback state' }, { status: 500 });
  }
}
