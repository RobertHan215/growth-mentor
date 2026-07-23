import { NextRequest, NextResponse } from 'next/server';
import { getAudioFile, saveAudioFile, deleteAudioFile } from '@/lib/db';

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
    const id = searchParams.get('id');

    if (!id) {
      apiLog('audio', 'GET', url, null, 400, Date.now() - start);
      return NextResponse.json({ error: 'Audio ID required' }, { status: 400 });
    }

    const audio = await getAudioFile(id);
    if (!audio) {
      apiLog('audio', 'GET', url, { id }, 404, Date.now() - start);
      return NextResponse.json({ error: 'Audio not found' }, { status: 404 });
    }

    apiLog('audio', 'GET', url, { id }, 200, Date.now() - start);
    const bytes = Buffer.isBuffer(audio.blob)
      ? audio.blob
      : Buffer.from(audio.blob as unknown as Uint8Array);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': `audio/${audio.format}`,
        'Content-Length': String(bytes.length),
      },
    });
  } catch (error) {
    apiLog('audio', 'GET', url, null, 500, Date.now() - start);
    console.error('Failed to get audio:', error);
    return NextResponse.json({ error: 'Failed to get audio' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const url = request.url;
  try {
    const body = await request.json();
    const { action, data } = body;
    apiLog('audio', 'POST', url, { action, id: data?.id, format: data?.format }, 0, 0);

    if (action === 'save') {
      await saveAudioFile(data);
      apiLog('audio', 'POST', url, { action, id: data?.id }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      await deleteAudioFile(data.id);
      apiLog('audio', 'POST', url, { action, id: data?.id }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    apiLog('audio', 'POST', url, { action }, 400, Date.now() - start);
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    apiLog('audio', 'POST', url, null, 500, Date.now() - start);
    console.error('Audio API error:', error);
    const message = error instanceof Error ? error.message : 'Failed to process audio';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
