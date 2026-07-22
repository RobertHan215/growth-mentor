import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('一对一报告保存服务');

export interface TrainingResultMessageInput {
  role: string;
  content: string;
  timestamp?: number;
  audioUrl?: string;
}

export interface PersistTrainingResultInput {
  userId: string;
  stageId: string;
  sceneId?: string;
  difficulty?: string;
  scores?: unknown;
  scoreTree?: unknown;
  totalScore: number;
  summary?: string;
  highlights?: unknown;
  improvements?: unknown;
  objectives?: unknown;
  rounds?: number;
  duration?: number;
  messages?: TrainingResultMessageInput[];
  roleConfig?: unknown;
  sessionId?: string;
  isRegenerated?: boolean;
  reportIndex?: number;
}

export async function persistTrainingResult(input: PersistTrainingResultInput): Promise<{
  resultId: string;
  sessionId: string;
}> {
  const startedAt = Date.now();
  const sceneId = input.sceneId || 'one-on-one';
  const difficulty = input.difficulty || 'medium';
  const isRegenerated = Boolean(input.isRegenerated);
  const sessionId = input.sessionId || `oo-${Date.now()}`;
  const messages = Array.isArray(input.messages) ? input.messages : [];

  log.info(
    `[一对一报告保存] 开始保存评估报告 用户=${input.userId} 课程=${input.stageId} 场景=${sceneId} 难度=${difficulty} 总分=${input.totalScore} 重新评估=${isRegenerated} 会话ID=${sessionId} 有评分树=${Boolean(input.scoreTree)}`,
  );

  let result;
  if (isRegenerated) {
    const existingResult = await prisma.trainingResult.findFirst({
      where: { sessionId, userId: input.userId },
    });
    if (existingResult) {
      result = await prisma.trainingResult.update({
        where: { id: existingResult.id },
        data: {
          scores: input.scoreTree || input.scores || [],
          totalScore: input.totalScore || 0,
          summary: input.summary || '',
          highlights: input.highlights || [],
          improvements: input.improvements || [],
          objectives: input.objectives || [],
          rounds: input.rounds || 0,
          duration: input.duration || 0,
        },
      });
      log.info(`[一对一报告保存] 重新评估已覆盖现有报告结果 结果ID=${result.id} 会话ID=${sessionId}`);
    } else {
      result = await prisma.trainingResult.create({
        data: {
          userId: input.userId,
          stageId: input.stageId,
          sceneId,
          sessionId,
          difficulty,
          scores: input.scoreTree || input.scores || [],
          totalScore: input.totalScore || 0,
          summary: input.summary || '',
          highlights: input.highlights || [],
          improvements: input.improvements || [],
          objectives: input.objectives || [],
          rounds: input.rounds || 0,
          duration: input.duration || 0,
        },
      });
      log.warn(`[一对一报告保存] 重新评估未找到现有报告，已兜底创建 结果ID=${result.id} 会话ID=${sessionId}`);
    }
  } else {
    result = await prisma.trainingResult.create({
      data: {
        userId: input.userId,
        stageId: input.stageId,
        sceneId,
        sessionId,
        difficulty,
        scores: input.scoreTree || input.scores || [],
        totalScore: input.totalScore || 0,
        summary: input.summary || '',
        highlights: input.highlights || [],
        improvements: input.improvements || [],
        objectives: input.objectives || [],
        rounds: input.rounds || 0,
        duration: input.duration || 0,
      },
    });
  }

  log.info(
    `[一对一报告保存] 训练结果处理完成 结果ID=${result.id} 会话ID=${sessionId} 用户=${input.userId} 课程=${input.stageId}`,
  );

  if (messages.length > 0 || isRegenerated) {
    const reportPayload = {
      totalScore: input.totalScore,
      scores: input.scoreTree || input.scores || [],
      scoreTree: input.scoreTree || null,
      summary: input.summary || '',
      highlights: input.highlights || [],
      improvements: input.improvements || [],
      rounds: input.rounds || 0,
      duration: input.duration || 0,
      difficulty,
    };

    if (isRegenerated) {
      const existing = await prisma.chatSession.findUnique({
        where: { id: sessionId },
      });
      if (existing) {
        const currentConfig = (existing.config as Record<string, unknown>) || {};
        await prisma.chatSession.update({
          where: { id: sessionId },
          data: {
            config: {
              ...currentConfig,
              totalScore: input.totalScore,
              report: reportPayload,
            },
          },
        });
        log.info(`[一对一报告保存] 重新评估已更新现有会话报告 会话ID=${sessionId}`);
      } else {
        log.warn(`[一对一报告保存] 未找到现有会话，跳过更新 会话ID=${sessionId}`);
      }
    } else {
      await prisma.chatSession.create({
        data: {
          id: sessionId,
          userId: input.userId,
          stageId: input.stageId,
          sceneId,
          type: 'one-on-one',
          title:
            typeof input.roleConfig === 'object' && input.roleConfig !== null
              ? `${(input.roleConfig as { userRole?: { name?: string } }).userRole?.name || '学员'} vs ${(input.roleConfig as { aiRole?: { name?: string } }).aiRole?.name || 'AI'}`
              : '一对一对练',
          status: 'archived',
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp || Date.now(),
            audioUrl: m.audioUrl,
          })),
          config: {
            mode: 'one-on-one',
            roleConfig: input.roleConfig || {},
            totalScore: input.totalScore,
            report: reportPayload,
          },
          toolCalls: [],
          pendingToolCalls: [],
        },
      });
      log.info(
        `[一对一报告保存] 对话会话已新建保存 会话ID=${sessionId} 用户=${input.userId} 消息数=${messages.length}`,
      );
    }
  }

  log.info(
    `[一对一报告保存] 保存评估报告完成 结果ID=${result.id} 会话ID=${sessionId} 总耗时=${Date.now() - startedAt}ms`,
  );

  return {
    resultId: result.id,
    sessionId,
  };
}
