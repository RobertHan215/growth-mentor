import { NextRequest, NextResponse } from 'next/server';
import {
  createChatSession,
  getChatSessionsByStageId,
  updateChatSession,
  deleteChatSession,
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
    const stageId = searchParams.get('stageId');

    if (!stageId) {
      apiLog('chat-db', 'GET', url, null, 400, Date.now() - start);
      return NextResponse.json({ error: 'Missing stageId' }, { status: 400 });
    }

    const sessions = await getChatSessionsByStageId(stageId);
    apiLog('chat-db', 'GET', url, { stageId }, 200, Date.now() - start);
    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    apiLog('chat-db', 'GET', url, null, 500, Date.now() - start);
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Failed to get chat sessions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const url = request.url;
  try {
    const body = await request.json();
    const { action, data } = body;
    apiLog('chat-db', 'POST', url, { action, data }, 0, 0);

    if (action === 'create') {
      await createChatSession(data);
      apiLog('chat-db', 'POST', url, { action, data }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    if (action === 'update') {
      const { id: sessionId, ...fields } = data;
      await updateChatSession(sessionId, fields);
      apiLog('chat-db', 'POST', url, { action, data }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      await deleteChatSession(data.id);
      apiLog('chat-db', 'POST', url, { action, data }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    apiLog('chat-db', 'POST', url, { action, data }, 400, Date.now() - start);
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    apiLog('chat-db', 'POST', url, null, 500, Date.now() - start);
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Failed to process chat' }, { status: 500 });
  }
}
