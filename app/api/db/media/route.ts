import { NextRequest, NextResponse } from 'next/server';
import {
  saveMediaFile,
  getMediaFile,
  getMediaFilesByStageId,
  deleteMediaFile,
  mediaFileKey,
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
    const id = searchParams.get('id');
    const stageId = searchParams.get('stageId');

    if (id) {
      const media = await getMediaFile(id);
      apiLog('media', 'GET', url, { id }, 200, Date.now() - start);
      return NextResponse.json({ success: true, data: media });
    }

    if (stageId) {
      const media = await getMediaFilesByStageId(stageId);
      apiLog('media', 'GET', url, { stageId }, 200, Date.now() - start);
      return NextResponse.json({ success: true, data: media });
    }

    apiLog('media', 'GET', url, null, 400, Date.now() - start);
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  } catch (error) {
    apiLog('media', 'GET', url, null, 500, Date.now() - start);
    console.error('Media API error:', error);
    return NextResponse.json({ error: 'Failed to get media' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const url = request.url;
  try {
    const formData = await request.formData();
    const action = formData.get('action') as string;
    const stageId = formData.get('stageId') as string;
    const elementId = formData.get('elementId') as string;
    const type = formData.get('type') as 'image' | 'video';
    const mimeType = formData.get('mimeType') as string;
    const prompt = formData.get('prompt') as string;
    const params = formData.get('params') as string;
    const errMsg = formData.get('error') as string | null;
    const errorCode = formData.get('errorCode') as string | null;
    const blob = formData.get('blob') as File | null;
    const poster = formData.get('poster') as File | null;

    const logData = {
      action,
      stageId,
      elementId,
      type,
      mimeType,
      prompt,
      params,
      error: errMsg,
      errorCode,
      blobSize: blob?.size,
      posterSize: poster?.size,
    };
    apiLog('media', 'POST', url, logData, 0, 0);

    if (action === 'save') {
      const buffer = blob ? Buffer.from(await blob.arrayBuffer()) : Buffer.from([]);
      const posterBuffer = poster ? Buffer.from(await poster.arrayBuffer()) : undefined;

      await saveMediaFile({
        id: mediaFileKey(stageId, elementId),
        stageId,
        type,
        blob: buffer,
        mimeType,
        size: buffer.length,
        poster: posterBuffer,
        prompt,
        params,
        error: errMsg || undefined,
        errorCode: errorCode || undefined,
        createdAt: Date.now(),
      });

      apiLog('media', 'POST', url, logData, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      const id = formData.get('id') as string;
      await deleteMediaFile(id);
      apiLog('media', 'POST', url, { action, id }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    apiLog('media', 'POST', url, logData, 400, Date.now() - start);
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    apiLog('media', 'POST', url, null, 500, Date.now() - start);
    console.error('Media API error:', error);
    return NextResponse.json({ error: 'Failed to process media' }, { status: 500 });
  }
}
