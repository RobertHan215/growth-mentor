import type { Prisma } from '@prisma/client';
import { createLogger } from '@/lib/logger';
import {
  markAsyncTaskFailed,
  markAsyncTaskRunning,
  markAsyncTaskSucceeded,
} from '@/lib/server/async-task-store';
import {
  runTrainingEvaluation,
  type TrainingEvaluationSessionUser,
} from '@/lib/server/training-evaluation';

const log = createLogger('一对一评估任务');
const runningJobs = new Map<string, Promise<void>>();

export function runTrainingEvaluationJob(
  jobId: string,
  input: Record<string, unknown>,
  sessionUser: TrainingEvaluationSessionUser,
  headers: Record<string, string>,
): Promise<void> {
  const existing = runningJobs.get(jobId);
  if (existing) return existing;

  const jobPromise = (async () => {
    try {
      await markAsyncTaskRunning(jobId);
      log.info(`[一对一评估任务] 开始执行 jobId=${jobId}`);

      const data = await runTrainingEvaluation(input, {
        sessionUser,
        headers,
      });

      await markAsyncTaskSucceeded(
        jobId,
        data as unknown as Prisma.InputJsonValue,
        typeof data.resultId === 'string' ? data.resultId : undefined,
      );
      log.info(
        `[一对一评估任务] 执行成功 jobId=${jobId} 已保存=${Boolean(data.saved)}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`[一对一评估任务] 执行失败 jobId=${jobId} 错误=${message}`);
      try {
        await markAsyncTaskFailed(jobId, message);
      } catch (markFailedError) {
        log.error(`[一对一评估任务] 标记失败状态异常 jobId=${jobId}`, markFailedError);
      }
    } finally {
      runningJobs.delete(jobId);
    }
  })();

  runningJobs.set(jobId, jobPromise);
  return jobPromise;
}
