import { after, type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { nanoid } from 'nanoid';
import type { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth/config';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  createAsyncTask,
  isValidAsyncTaskId,
  readAsyncTask,
  TRAINING_EVALUATION_TASK_TYPE,
} from '@/lib/server/async-task-store';
import { runTrainingEvaluationJob } from '@/lib/server/training-evaluation-job-runner';

export const maxDuration = 300;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return apiError('INVALID_REQUEST', 403, 'Admin only');
    }

    const { id } = await context.params;
    if (!isValidAsyncTaskId(id)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid async task id');
    }

    const oldTask = await readAsyncTask(id);
    if (!oldTask) {
      return apiError('INVALID_REQUEST', 404, 'Async task not found');
    }
    if (oldTask.type !== TRAINING_EVALUATION_TASK_TYPE) {
      return apiError('INVALID_REQUEST', 400, 'This task type does not support retry yet');
    }
    if (!isRecord(oldTask.payload)) {
      return apiError('INVALID_REQUEST', 400, 'Task payload is invalid');
    }

    const payload: Record<string, unknown> = {
      ...oldTask.payload,
      ...(oldTask.userId ? { persistUserId: oldTask.userId } : {}),
    };
    const newTaskId = nanoid(10);
    const newTask = await createAsyncTask({
      id: newTaskId,
      type: oldTask.type,
      message: 'Evaluation job queued',
      userId: oldTask.userId,
      stageId: oldTask.stageId,
      targetType: oldTask.targetType,
      payload: payload as Prisma.InputJsonValue,
      retryOfTaskId: oldTask.id,
      attempt: oldTask.attempt + 1,
    });

    const headers = copyEvaluationHeaders(req);

    after(() =>
      runTrainingEvaluationJob(
        newTaskId,
        payload,
        { id: session.user.id, role: session.user.role },
        headers,
      ),
    );

    return apiSuccess({ task: newTask }, 202);
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to retry async task',
      error instanceof Error ? error.message : String(error),
    );
  }
}
