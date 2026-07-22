import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { createLogger } from '@/lib/logger';
import { persistTrainingResult } from '@/lib/server/training-result-persistence';

const log = createLogger('一对一报告保存 API');

/**
 * POST /api/training/save-result — Persist a training evaluation result
 *
 * Saves the completed one-on-one training result to the database.
 * Also saves chat messages to a ChatSession record.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      stageId,
      sceneId = 'one-on-one',
      difficulty = 'medium',
      scores,
      scoreTree,
      totalScore,
      summary,
      highlights,
      improvements,
      objectives = [],
      rounds,
      duration,
      messages,
      roleConfig,
      sessionId,
      isRegenerated,
      reportIndex,
    } = body;

    if (!stageId || (!scores && !scoreTree) || totalScore === undefined) {
      log.warn(
        `[一对一报告保存] 拒绝保存：缺少必要字段 用户=${session.user.id} 课程=${stageId || '无'} 有平铺评分=${Boolean(scores)} 有评分树=${Boolean(scoreTree)} 有总分=${totalScore !== undefined}`,
      );
      return NextResponse.json(
        { error: 'Missing required fields: stageId, scores, totalScore' },
        { status: 400 },
      );
    }

    const saved = await persistTrainingResult({
      userId: session.user.id,
      stageId,
      sceneId,
      difficulty,
      scores,
      scoreTree,
      totalScore: totalScore || 0,
      summary: summary || '',
      highlights: highlights || [],
      improvements: improvements || [],
      objectives: objectives || [],
      rounds: rounds || 0,
      duration: duration || 0,
      messages,
      roleConfig,
      sessionId,
      isRegenerated,
      reportIndex,
    });

    return NextResponse.json({
      success: true,
      resultId: saved.resultId,
      sessionId: saved.sessionId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`[一对一报告保存] 保存评估报告失败 错误=${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
