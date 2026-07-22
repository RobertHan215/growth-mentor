import { NextRequest, NextResponse } from 'next/server';
import {
  getScenesByStageId,
  createScene,
  updateScene,
  deleteScene,
  deleteScenesByStageId,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  const url = request.url;
  try {
    const { searchParams } = new URL(url);
    const stageId = searchParams.get('stageId');

    if (stageId) {
      const scenes = await getScenesByStageId(stageId);
      return NextResponse.json({ success: true, data: scenes });
    }

    return NextResponse.json({ error: 'Missing stageId' }, { status: 400 });
  } catch (error) {
    console.error('Scene API error:', error);
    return NextResponse.json({ error: 'Failed to get scenes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;

    if (!action || !data) {
      return NextResponse.json({ error: 'Missing action or data', body }, { status: 400 });
    }

    if (action === 'create') {
      await createScene(data);
      return NextResponse.json({ success: true });
    }

    if (action === 'update') {
      const { id: sceneId, ...fields } = data;
      await updateScene(sceneId, fields);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      if (data.stageId) {
        await deleteScenesByStageId(data.stageId);
      } else if (data.id || data.sceneId) {
        await deleteScene(data.id || data.sceneId);
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'deleteByStage') {
      await deleteScenesByStageId(data.stageId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Scene API error:', error);
    return NextResponse.json({ error: 'Failed to process scene' }, { status: 500 });
  }
}
