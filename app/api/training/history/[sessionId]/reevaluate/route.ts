import { after, type NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { nanoid } from 'nanoid';
import type { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createAsyncTask, TRAINING_EVALUATION_TASK_TYPE } from '@/lib/server/async-task-store';
import { runTrainingEvaluationJob } from '@/lib/server/training-evaluation-job-runner';
import { createLogger } from '@/lib/logger';

const log = createLogger('历史对练评估API');

function copyEvaluationHeaders(req: NextRequest): Record<string, string> {
  const names = [
    'cookie',
    'x-model',
    'x-api-key',
    'x-base-url',
    'x-provider-type',
    'x-requires-api-key',
    'x-use-frontend-model-config',
  ];
  const headers: Record<string, string> = {};
  for (const name of names) {
    const value = req.headers.get(name);
    if (value) headers[name] = value;
  }
  return headers;
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const startedAt = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return apiError('INVALID_REQUEST', 401, 'Unauthorized');
    }

    const { sessionId } = await context.params;
    if (!sessionId) {
      return apiError('INVALID_REQUEST', 400, 'Session ID is required');
    }

    // 1. Fetch the historical chat session
    const chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!chatSession) {
      return apiError('INVALID_REQUEST', 404, 'Chat session not found');
    }

    // 2. Authorization check (only owner or admin can reevaluate)
    if (chatSession.userId !== session.user.id && session.user.role !== 'admin') {
      return apiError('INVALID_REQUEST', 403, 'Forbidden');
    }

    // 3. Compile dialogue history from messages
    const sourceMessages = Array.isArray(chatSession.messages)
      ? (chatSession.messages as { role?: string; content?: string; intercepted?: boolean; trainingReport?: unknown }[])
      : [];
    const dialogueHistory = sourceMessages
      .filter(
        (m) =>
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' &&
          m.content.trim().length > 0,
      )
      .map((m) => ({ role: m.role!, content: m.content!.trim() }));

    const hasUserMessage = dialogueHistory.some((m) => m.role === 'user');
    if (!hasUserMessage) {
      return apiError('INVALID_REQUEST', 400, 'Cannot evaluate chat session without user messages');
    }

    // 4. Extract config/report fields from existing chatSession
    const config = (chatSession.config as Record<string, unknown>) || {};
    const report = (config.report as Record<string, unknown>) || {};
    const difficulty = (report.difficulty as string) || 'medium';
    const duration = (report.duration as number) || 0;
    const rounds = (report.rounds as number) || Math.floor(dialogueHistory.length / 2);
    const roleConfig = (config.roleConfig || {}) as {
      background?: string;
      aiRole?: { name?: string };
      userRole?: { name?: string };
    };

    // Calculate next reportIndex
    const existingCount = await prisma.trainingResult.count({
      where: { sessionId },
    });
    const nextIndex = existingCount + 1;

    // 5. Build scenario scoring payload
    const evaluationPayload = {
      trainingContent: {
        mode: 'roleplay',
        scenario: {
          background: roleConfig.background || '',
          aiRole: roleConfig.aiRole?.name || 'AI',
          learnerRole: roleConfig.userRole?.name || '学员',
          difficulty,
          difficultyPersonas: {},
        },
        objectives: ['完成角色扮演对练'],
        scoringDimensions: [], // resolved dynamically on backend
        maxRounds: 10,
      },
      dialogueHistory,
      difficulty,
      stageId: chatSession.stageId,
      sensitiveWordsHit: [], // historical runs don't re-compute live sensitive word alerts
      rounds,
      duration,
      messages: sourceMessages.filter((m) => !m.trainingReport && !m.intercepted),
      roleConfig,
      isRegenerated: true,
      reportIndex: nextIndex,
      persistUserId: chatSession.userId,
      sessionId,
    };

    const jobId = nanoid(10);
    const job = await createAsyncTask({
      id: jobId,
      type: TRAINING_EVALUATION_TASK_TYPE,
      message: 'Re-evaluation job queued',
      userId: chatSession.userId || session.user.id,
      stageId: chatSession.stageId,
      targetType: 'training_result',
      payload: evaluationPayload as Prisma.InputJsonValue,
    });

    const headers = copyEvaluationHeaders(req);

    log.info(
      `[历史对练评估API] 创建历史重评估任务 jobId=${jobId} sessionId=${sessionId} 用户=${session.user.id} 课程=${chatSession.stageId} 耗时=${Date.now() - startedAt}ms`,
    );

    after(() =>
      runTrainingEvaluationJob(
        jobId,
        evaluationPayload,
        { id: session.user.id, role: session.user.role },
        headers,
      ),
    );

    return apiSuccess({
      jobId,
      status: job.status,
      message: job.message,
    }, 202);

  } catch (error) {
    log.error(`[历史对练评估API] 失败 耗时=${Date.now() - startedAt}ms`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create re-evaluation job',
      error instanceof Error ? error.message : String(error),
    );
  }
}
