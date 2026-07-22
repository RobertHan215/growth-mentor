import { prisma } from '@/lib/db';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromHeaderValues } from '@/lib/server/resolve-model';
import { createLogger } from '@/lib/logger';
import type { WeaknessUpdateAnalysis } from '@/lib/types/training-weakness';

const log = createLogger('历史不足更新');

function shouldLogEvaluationPrompts(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.LOG_EVALUATION_PROMPTS === 'true';
}

function logWeaknessPrompt(systemPrompt: string, userPrompt: string): void {
  if (!shouldLogEvaluationPrompts()) {
    return;
  }

  log.info(
    `\n========== Weakness Update System Prompt ==========\n${systemPrompt}\n========== End Weakness Update System Prompt ==========\n` +
      `========== Weakness Update User Prompt ==========\n${userPrompt}\n========== End Weakness Update User Prompt ==========`,
  );
}

function logWeaknessText(label: string, text: string): void {
  if (!shouldLogEvaluationPrompts()) {
    return;
  }

  log.info(`\n========== ${label} ==========\n${text}\n========== End ${label} ==========`);
}

interface UpdateWeaknessesParams {
  userId: string;
  stageId: string;
  resultId: string;
  evaluationReport: {
    totalScore: number;
    summary: string;
    improvements: string[];
    highlights: string[];
    scores: unknown;
  };
  headers: Headers | Record<string, string | undefined>;
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start === -1) {
    throw new Error('No JSON object found in AI response');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }

  throw new Error('Unterminated JSON object in AI response');
}

/**
 * After a training evaluation completes, call this to update the user's
 * weakness list for the given course. AI compares the new evaluation report
 * with existing active weaknesses to determine which are resolved and which
 * are new.
 */
export async function updateTrainingWeaknesses(
  params: UpdateWeaknessesParams,
): Promise<{ resolved: number; added: number }> {
  const { userId, stageId, resultId, evaluationReport, headers } = params;
  const startedAt = Date.now();

  log.info(
    `[历史不足更新] 开始更新历史不足 用户=${userId} 课程=${stageId} 结果ID=${resultId} 总分=${evaluationReport.totalScore}`,
  );

  try {
    // 1. Query existing active weaknesses
    const existingWeaknesses = await prisma.trainingWeakness.findMany({
      where: { userId, stageId, status: 'active' },
      orderBy: { firstSeenAt: 'asc' },
    });

    log.info(
      `[历史不足更新] 当前活跃不足数=${existingWeaknesses.length} 用户=${userId} 课程=${stageId}`,
    );

    // 2. Build AI analysis prompt
    const existingWeaknessesText =
      existingWeaknesses.length > 0
        ? existingWeaknesses
            .map((w) => `- ID: ${w.id}, 名称: ${w.name}, 描述: ${w.description}`)
            .join('\n')
        : '（暂无历史不足记录，这是该学员在本课程的首次评估）';

    const improvementsText =
      evaluationReport.improvements.length > 0
        ? evaluationReport.improvements.map((imp, i) => `${i + 1}. ${imp}`).join('\n')
        : '（无待改进项）';

    const highlightsText =
      evaluationReport.highlights.length > 0
        ? evaluationReport.highlights.map((h, i) => `${i + 1}. ${h}`).join('\n')
        : '（无亮点）';

    const systemPrompt = `你是一个培训评估专家。请对比本次对练评估报告与学员的历史不足列表，分析：
1. 哪些历史不足在本次对练中已经改善并达标？
2. 本次对练中发现了哪些新的不足？

注意：
- 只有确实有明显改善的不足才标记为已解决
- 新不足必须是本次评估报告中明确指出的待改进项
- 如果历史不足与本次新发现的不足内容相似，不要重复添加
- 每个不足项的名称要简短（2-6个字），描述要具体，改进建议要可操作
- 如果没有历史不足列表，则只需分析本次报告中的待改进项并生成新的不足

请严格按以下 JSON 格式输出，不要输出任何其他内容：
{
  "resolved": ["不足ID1", "不足ID2"],
  "newWeaknesses": [
    { "name": "不足名称", "description": "具体描述", "suggestion": "改进建议" }
  ]
}`;

    const userPrompt = `【本次评估报告】
总分：${evaluationReport.totalScore}/100
总结：${evaluationReport.summary}
亮点：
${highlightsText}
待改进：
${improvementsText}

【历史不足列表】
${existingWeaknessesText}`;

    // 3. Call AI for analysis
    const { model: languageModel } = await resolveModelFromHeaderValues(headers);
    logWeaknessPrompt(systemPrompt, userPrompt);
    const result = await callLLM(
      {
        model: languageModel,
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: 1024,
      },
      'weakness-update',
    );

    log.info(
      `[历史不足更新] AI分析完成 用户=${userId} 课程=${stageId} 返回字符数=${result.text.length} 耗时=${Date.now() - startedAt}ms`,
    );
    logWeaknessText('Weakness Update Raw Response', result.text);

    // 4. Parse AI response
    const analysis = extractJsonObject(result.text) as WeaknessUpdateAnalysis;

    const resolvedIds = Array.isArray(analysis.resolved)
      ? analysis.resolved.filter(
          (id): id is string =>
            typeof id === 'string' &&
            existingWeaknesses.some((w) => w.id === id),
        )
      : [];

    const newWeaknesses = Array.isArray(analysis.newWeaknesses)
      ? analysis.newWeaknesses.filter(
          (w) =>
            typeof w === 'object' &&
            w !== null &&
            typeof w.name === 'string' &&
            w.name.trim().length > 0 &&
            typeof w.description === 'string' &&
            typeof w.suggestion === 'string',
        )
      : [];

    // 5. Persist changes in a transaction
    await prisma.$transaction(async (tx) => {
      // Mark resolved weaknesses
      if (resolvedIds.length > 0) {
        await tx.trainingWeakness.updateMany({
          where: {
            id: { in: resolvedIds },
            userId,
            stageId,
            status: 'active',
          },
          data: {
            status: 'resolved',
            resolvedAt: new Date(),
            resolveResultId: resultId,
          },
        });
      }

      // Create new weaknesses
      if (newWeaknesses.length > 0) {
        await tx.trainingWeakness.createMany({
          data: newWeaknesses.map((w) => ({
            userId,
            stageId,
            name: w.name.trim(),
            description: w.description.trim(),
            suggestion: w.suggestion.trim(),
            status: 'active',
            sourceResultId: resultId,
          })),
        });
      }
    });

    log.info(
      `[历史不足更新] 更新完成 用户=${userId} 课程=${stageId} 已解决=${resolvedIds.length} 新增=${newWeaknesses.length} 总耗时=${Date.now() - startedAt}ms`,
    );

    return { resolved: resolvedIds.length, added: newWeaknesses.length };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.warn(
      `[历史不足更新] 更新失败 用户=${userId} 课程=${stageId} 错误=${message} 耗时=${Date.now() - startedAt}ms`,
    );
    // Return zero counts on failure — weakness update is best-effort
    return { resolved: 0, added: 0 };
  }
}
