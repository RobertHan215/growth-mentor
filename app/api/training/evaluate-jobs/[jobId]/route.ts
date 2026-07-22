import { type NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { isValidAsyncTaskId, readAsyncTask } from '@/lib/server/async-task-store';

export const dynamic = 'force-dynamic';

const log = createLogger('一对一评估任务API');

export async function GET(_req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const startedAt = Date.now();
  try {
    const { jobId } = await context.params;
    if (!isValidAsyncTaskId(jobId)) {
      log.warn(`[一对一评估任务API] 查询评估任务被拒绝：非法 jobId=${jobId}`);
      return apiError('INVALID_REQUEST', 400, 'Invalid evaluation job id');
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      log.warn(`[一对一评估任务API] 查询评估任务被拒绝：未登录 jobId=${jobId}`);
      return apiError('INVALID_REQUEST', 401, 'Unauthorized');
    }

    const job = await readAsyncTask(jobId);
    if (!job) {
      log.warn(`[一对一评估任务API] 查询评估任务不存在 jobId=${jobId} 用户=${session.user.id}`);
      return apiError('INVALID_REQUEST', 404, 'Evaluation job not found');
    }
    if (job.userId !== session.user.id && session.user.role !== 'admin') {
      log.warn(
        `[一对一评估任务API] 查询评估任务被拒绝：无权限 jobId=${jobId} 任务用户=${job.userId || '无'} 请求用户=${session.user.id}`,
      );
      return apiError('INVALID_REQUEST', 403, 'Forbidden');
    }

    log.info(
      `[一对一评估任务API] 查询评估任务 jobId=${jobId} 用户=${session.user.id} 状态=${job.status} 进度=${job.progress} 课程=${job.stageId || '无'} 耗时=${Date.now() - startedAt}ms`,
    );
    return apiSuccess({
      jobId: job.id,
      status: job.status,
      message: job.message,
      result: job.result,
      error: job.error,
      done: job.status === 'succeeded' || job.status === 'failed',
    });
  } catch (error) {
    log.error(`[一对一评估任务API] 查询评估任务失败 耗时=${Date.now() - startedAt}ms`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to retrieve evaluation job',
      error instanceof Error ? error.message : String(error),
    );
  }
}
