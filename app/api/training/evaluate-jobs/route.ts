import { after, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { nanoid } from 'nanoid';
import type { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth/config';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createAsyncTask, TRAINING_EVALUATION_TASK_TYPE } from '@/lib/server/async-task-store';
import { runTrainingEvaluationJob } from '@/lib/server/training-evaluation-job-runner';

export const maxDuration = 300;

const log = createLogger('一对一评估任务API');
const EVALUATION_POLL_INITIAL_DELAY_MS = 1_000;
const EVALUATION_POLL_INTERVAL_MS = 2_000;

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

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      log.warn('[一对一评估任务API] 创建评估任务被拒绝：未登录');
      return apiError('INVALID_REQUEST', 401, 'Unauthorized');
    }

    const input = (await req.json()) as Record<string, unknown>;
    if (!input.trainingContent || !Array.isArray(input.dialogueHistory)) {
      log.warn(`[一对一评估任务API] 创建评估任务参数缺失 用户=${session.user.id}`);
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing evaluation input');
    }

    const payload: Record<string, unknown> = {
      ...input,
      persistUserId: session.user.id,
    };
    const stageId = typeof input.stageId === 'string' ? input.stageId : null;
    const jobId = nanoid(10);
    const job = await createAsyncTask({
      id: jobId,
      type: TRAINING_EVALUATION_TASK_TYPE,
      message: 'Evaluation job queued',
      userId: session.user.id,
      stageId,
      targetType: 'training_result',
      payload: payload as Prisma.InputJsonValue,
    });
    const headers = copyEvaluationHeaders(req);

    log.info(
      `[一对一评估任务API] 创建评估任务成功 jobId=${jobId} 用户=${session.user.id} 课程=${stageId || '无'} 对话数=${input.dialogueHistory.length} 首次查询延迟=${EVALUATION_POLL_INITIAL_DELAY_MS}ms 轮询间隔=${EVALUATION_POLL_INTERVAL_MS}ms 耗时=${Date.now() - startedAt}ms`,
    );
    after(() =>
      runTrainingEvaluationJob(
        jobId,
        payload,
        { id: session.user.id, role: session.user.role },
        headers,
      ),
    );

    return apiSuccess(
      {
        jobId,
        status: job.status,
        message: job.message,
        initialDelayMs: EVALUATION_POLL_INITIAL_DELAY_MS,
        pollIntervalMs: EVALUATION_POLL_INTERVAL_MS,
      },
      202,
    );
  } catch (error) {
    log.error(`[一对一评估任务API] 创建评估任务失败 耗时=${Date.now() - startedAt}ms`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create evaluation job',
      error instanceof Error ? error.message : String(error),
    );
  }
}
