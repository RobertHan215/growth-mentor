import { NextRequest, NextResponse } from 'next/server';
import { getAudioFile } from '@/lib/db';

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
    return new NextResponse(new Uint8Array(audio.blob), {
      headers: {
        'Content-Type': `audio/${audio.format}`,
        'Content-Length': audio.blob.length.toString(),
      },
    });
  } catch (error) {
    apiLog('audio', 'GET', url, null, 500, Date.now() - start);
    console.error('Failed to get audio:', error);
    return NextResponse.json({ error: 'Failed to get audio' }, { status: 500 });
  }
}
