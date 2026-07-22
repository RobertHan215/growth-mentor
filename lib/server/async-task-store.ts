import type { AsyncTask, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export const TRAINING_EVALUATION_TASK_TYPE = 'training_evaluation';

export type AsyncTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface CreateAsyncTaskInput {
  id: string;
  type: string;
  message: string;
  userId?: string | null;
  stageId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  payload: Prisma.InputJsonValue;
  retryOfTaskId?: string | null;
  attempt?: number;
}

export function isValidAsyncTaskId(taskId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(taskId);
}

export async function createAsyncTask(input: CreateAsyncTaskInput): Promise<AsyncTask> {
  return prisma.asyncTask.create({
    data: {
      id: input.id,
      type: input.type,
      message: input.message,
      userId: input.userId ?? null,
      stageId: input.stageId ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      payload: input.payload,
      retryOfTaskId: input.retryOfTaskId ?? null,
      attempt: input.attempt ?? 1,
    },
  });
}

export async function readAsyncTask(taskId: string): Promise<AsyncTask | null> {
  return prisma.asyncTask.findUnique({ where: { id: taskId } });
}

export async function markAsyncTaskRunning(taskId: string): Promise<AsyncTask> {
  return prisma.asyncTask.update({
    where: { id: taskId },
    data: {
      status: 'running',
      progress: 10,
      startedAt: new Date(),
      completedAt: null,
      message: 'Evaluation report is being generated',
      error: null,
    },
  });
}

export async function markAsyncTaskSucceeded(
  taskId: string,
  result: Prisma.InputJsonValue,
  targetId?: string | null,
): Promise<AsyncTask> {
  return prisma.asyncTask.update({
    where: { id: taskId },
    data: {
      status: 'succeeded',
      progress: 100,
      completedAt: new Date(),
      message: 'Evaluation report generated',
      result,
      targetId: targetId ?? undefined,
    },
  });
}

export async function markAsyncTaskFailed(taskId: string, error: string): Promise<AsyncTask> {
  return prisma.asyncTask.update({
    where: { id: taskId },
    data: {
      status: 'failed',
      progress: 100,
      completedAt: new Date(),
      message: 'Evaluation report generation failed',
      error,
    },
  });
}
