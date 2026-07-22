import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromHeaderValues } from '@/lib/server/resolve-model';
import { getEnabledScoringConfigForStage } from '@/lib/server/one-on-one-scoring-config';
import {
  buildScoringResultSnapshot,
  flattenScoringCriteria,
} from '@/lib/training/one-on-one-scoring-config';
import type { FlattenedScoringDetail } from '@/lib/types/one-on-one-scoring';
import type { TrainingContent, DimensionScore } from '@/lib/types/training';
import { createLogger } from '@/lib/logger';
import {
  persistTrainingResult,
  type TrainingResultMessageInput,
} from '@/lib/server/training-result-persistence';
import {
  buildSensitiveWordsPrompt,
  type SensitiveWordNotice,
} from '@/lib/training/one-on-one-session-presentation';
import { updateTrainingWeaknesses } from '@/lib/server/training-weakness-updater';

const log = createLogger('一对一评估 API');

function shouldLogEvaluationPrompts(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.LOG_EVALUATION_PROMPTS === 'true';
}

function logEvaluationPrompt(label: string, systemPrompt: string, userPrompt: string): void {
  if (!shouldLogEvaluationPrompts()) {
    return;
  }

  log.info(
    `\n========== ${label} System Prompt ==========\n${systemPrompt}\n========== End ${label} System Prompt ==========\n` +
      `========== ${label} User Prompt ==========\n${userPrompt}\n========== End ${label} User Prompt ==========`,
  );
}

function logEvaluationText(label: string, text: string): void {
  if (!shouldLogEvaluationPrompts()) {
    return;
  }

  log.info(`\n========== ${label} ==========\n${text}\n========== End ${label} ==========`);
}

export interface TrainingEvaluationSessionUser {
  id: string;
  role?: string | null;
}

export interface TrainingEvaluationResult extends EvaluationReportPayload {
  saved: boolean;
  resultId?: string;
  sessionId?: string;
}

export interface TrainingEvaluationInput {
  trainingContent: TrainingContent;
  dialogueHistory: { role: string; content: string }[];
  difficulty: string;
  directorName?: string;
  directorStyle?: string;
  stageId?: string;
  sensitiveWordsHit?: SensitiveWordNotice[];
  rounds?: number;
  duration?: number;
  messages?: TrainingResultMessageInput[];
  roleConfig?: unknown;
  persistUserId?: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArrayFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function scoreFrom(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return Number.NaN;
  }

  const score = Number(value);
  return Number.isFinite(score) ? score : Number.NaN;
}

function scoreFromZeroToHundred(value: unknown): number {
  const score = scoreFrom(value);
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(Math.max(Math.round(score), 0), 100);
}

interface ParsedDetailEvaluation {
  detailId: string;
  score: unknown;
  scoreDelta: unknown;
  reason: string;
  evidence: string;
}

function asDetailEvaluations(value: unknown): ParsedDetailEvaluation[] {
  if (!isRecord(value) || !Array.isArray(value.details)) {
    return [];
  }

  return value.details
    .filter(isRecord)
    .map((detail) => {
      const reason = typeof detail.reason === 'string' ? detail.reason : '';
      const evidence = typeof detail.evidence === 'string' ? detail.evidence : '';

      return {
        detailId: typeof detail.detailId === 'string' ? detail.detailId.trim() : '',
        score: detail.score,
        scoreDelta: detail.scoreDelta,
        reason,
        evidence,
      };
    })
    .filter((detail) => detail.detailId.length > 0);
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function logDetailEvaluationSnapshot(label: string, details: ParsedDetailEvaluation[]): void {
  if (!shouldLogEvaluationPrompts()) {
    return;
  }

  const scoreCount = details.filter(
    (detail) => detail.score !== undefined && detail.score !== null,
  ).length;
  const reasonCount = details.filter((detail) => hasText(detail.reason)).length;
  const evidenceCount = details.filter((detail) => hasText(detail.evidence)).length;

  log.info(
    `[一对一评估] ${label} 解析后明细统计 明细数=${details.length} score数=${scoreCount} reason数=${reasonCount} evidence数=${evidenceCount}`,
  );
  log.info(
    `\n========== ${label} Parsed Detail Evaluations ==========\n${JSON.stringify(details, null, 2)}\n========== End ${label} Parsed Detail Evaluations ==========`,
  );
}

interface EvaluationReportPayload {
  scores: DimensionScore[];
  scoreTree?: unknown;
  totalScore: number;
  summary: string;
  highlights: string[];
  improvements: string[];
  completedObjectives: string[];
}

function sanitizeDefaultScores(
  scoringDimensions: TrainingContent['scoringDimensions'],
  value: unknown,
): DimensionScore[] {
  const returnedScores = Array.isArray(value) ? value.filter(isRecord) : [];

  return scoringDimensions.map((dimension) => {
    const returnedScore = returnedScores.find(
      (score) => score.dimensionId === dimension.id || score.dimensionName === dimension.name,
    );

    return {
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      score: scoreFromZeroToHundred(returnedScore?.score),
      feedback: typeof returnedScore?.feedback === 'string' ? returnedScore.feedback : '',
    };
  });
}

// ---------------------------------------------------------------------------
// 分批评估辅助函数
// ---------------------------------------------------------------------------

/** callLLM 接受的 model 参数类型，避免引入额外的 AI SDK 类型 import */
type LLMModel = NonNullable<Parameters<typeof callLLM>[0]['model']>;

/** 每批最多包含的明细数，超过则按二级指标拆子批 */
const MAX_DETAILS_PER_BATCH = 12;

interface DetailBatch {
  primaryId: string;
  primaryName: string;
  details: FlattenedScoringDetail[];
}

/** 按一级指标分组；若某组明细过多再按二级指标拆子批 */
function splitDetailsIntoBatches(details: FlattenedScoringDetail[]): DetailBatch[] {
  const byPrimary = new Map<string, FlattenedScoringDetail[]>();
  for (const d of details) {
    const list = byPrimary.get(d.primaryId) ?? [];
    list.push(d);
    byPrimary.set(d.primaryId, list);
  }

  const batches: DetailBatch[] = [];
  for (const [primaryId, list] of byPrimary) {
    const primaryName = list[0]?.primaryName ?? primaryId;
    if (list.length <= MAX_DETAILS_PER_BATCH) {
      batches.push({ primaryId, primaryName, details: list });
      continue;
    }
    // 单个一级指标下明细过多，按二级指标拆子批
    const bySecondary = new Map<string, FlattenedScoringDetail[]>();
    for (const d of list) {
      const sl = bySecondary.get(d.secondaryId) ?? [];
      sl.push(d);
      bySecondary.set(d.secondaryId, sl);
    }
    let current: FlattenedScoringDetail[] = [];
    for (const [, sl] of bySecondary) {
      if (current.length > 0 && current.length + sl.length > MAX_DETAILS_PER_BATCH) {
        batches.push({ primaryId, primaryName, details: current });
        current = [];
      }
      current.push(...sl);
    }
    if (current.length > 0) {
      batches.push({ primaryId, primaryName, details: current });
    }
  }
  return batches;
}

interface BatchSharedContext {
  languageModel: LLMModel;
  dialogueText: string;
  objectiveList: string;
  difficultyLabel: string;
  styleInstruction: string;
  directorName?: string;
  sensitiveWordsPrompt: string;
  modeInstruction: string;
  configName: string;
  tagLabel: string;
  trainingContent: TrainingContent;
  referenceScript: string;
}

interface BatchResult {
  primaryId: string;
  primaryName: string;
  detailEvaluations: ParsedDetailEvaluation[];
  succeeded: boolean;
  rawText: string;
  error?: string;
}

function buildBatchDetailList(details: FlattenedScoringDetail[]): string {
  return details
    .map(
      (detail, index) =>
        `${index + 1}. detailId: ${detail.detailId}
   一级指标: ${detail.primaryName}
   二级指标: ${detail.secondaryName}
   指标明细: ${detail.detailName}
   满分: ${detail.maxScore}
   评分说明: ${detail.description || '无'}`,
    )
    .join('\n');
}

/** 评估单批明细：构建 prompt → callLLM（带 retry+validate+temperature=0）→ 解析 → 容错返回 */
async function evaluateSingleBatch(
  batch: DetailBatch,
  ctx: BatchSharedContext,
  stageLabel: string,
): Promise<BatchResult> {
  const detailList = buildBatchDetailList(batch.details);
  const expectedIds = new Set(batch.details.map((d) => d.detailId));

  const systemPrompt = `你是${ctx.directorName || '班主任'}，负责按后台配置的评分明细评估学员的一对一训练表现。${ctx.styleInstruction}

## 训练场景
- 模式：${ctx.trainingContent.mode === 'roleplay' ? '角色扮演对练' : '一对一导师辅导'}
- 场景背景：${ctx.trainingContent.scenario.background}
- AI角色：${ctx.trainingContent.scenario.aiRole}
- 学员角色：${ctx.trainingContent.scenario.learnerRole}
- 难度：${ctx.difficultyLabel}

## 训练目标
${ctx.objectiveList}

${ctx.referenceScript ? `## 参考话术\n${ctx.referenceScript}` : ''}

## 评分配置
- 配置名称：${ctx.configName}
- 标签：${ctx.tagLabel}

## 本批评分明细（共 ${batch.details.length} 项）
${detailList}
${ctx.sensitiveWordsPrompt}

## 你的任务
逐项评估以下对话记录中与本批明细相关的表现。${ctx.modeInstruction}
必须为本批每个 detailId 返回一条 details 记录，不要遗漏。
reason 必须说明为什么加分或扣分，用一句话，不超过 30 个字。
evidence 规则（重要）：score 大于 0（学员做到了该指标）时必须引用对话原话作为依据；score 为 0（未做到）时 evidence 填空字符串""，不要硬凑无关话术。不分加分制或扣分制，统一按此规则。
引用时格式：客户："原话"；学员："原话"。不超过 50 个字，不要引用与该指标无关的话术。

请只输出 JSON，不要输出任何其他内容：
{
  "details": [
    { "detailId": "<评分明细ID>", "score": <0到该明细最高分之间的非负数字>, "reason": "<加分或扣分原因>", "evidence": "<引用客户和学员聊天原话的依据>" }
  ]
}`;

  const userPrompt = `## 对话记录\n\n${ctx.dialogueText}`;
  const maxOutputTokens = batch.details.length * 200 + 256;

  logEvaluationPrompt(`OneOnOne Batch Evaluation [${batch.primaryName}]`, systemPrompt, userPrompt);

  try {
    const result = await callLLM(
      {
        model: ctx.languageModel,
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens,
        temperature: 0,
      },
      'training-evaluate',
      {
        retries: 2,
        validate: (text: string) => {
          try {
            const parsed = extractJsonObject(text);
            const evals = asDetailEvaluations(parsed);
            const returnedIds = new Set(evals.map((e) => e.detailId));
            for (const id of expectedIds) {
              if (!returnedIds.has(id)) return false;
            }
            return evals.length > 0;
          } catch {
            return false;
          }
        },
      },
    );

    const evaluation = extractJsonObject(result.text);
    const detailEvaluations = asDetailEvaluations(evaluation);

    // 代码兜底：学员做到了（score > 0）才保留 evidence，未做到（score = 0）强制清空
    // 统一规则，不分加分制/扣分制；即使 AI 不遵守 prompt 规则也在此兜住
    for (const item of detailEvaluations) {
      const scoreValue = scoreFrom(item.score);
      const achieved = Number.isFinite(scoreValue) && scoreValue > 0;
      if (!achieved) {
        item.evidence = '';
      }
    }

    logDetailEvaluationSnapshot(`OneOnOne Batch Evaluation [${batch.primaryName}]`, detailEvaluations);

    // 重试耗尽后可能仍有缺失项
    const returnedIds = new Set(detailEvaluations.map((e) => e.detailId));
    const missingCount = batch.details.filter((d) => !returnedIds.has(d.detailId)).length;
    if (missingCount > 0) {
      log.warn(
        `[一对一评估] 批次 [${batch.primaryName}] 仍有 ${missingCount} 项未评估，将用默认值填充 课程=${stageLabel}`,
      );
    }

    log.info(
      `[一对一评估] 批次 [${batch.primaryName}] 评估成功 明细数=${detailEvaluations.length} 课程=${stageLabel}`,
    );

    return {
      primaryId: batch.primaryId,
      primaryName: batch.primaryName,
      detailEvaluations,
      succeeded: true,
      rawText: result.text,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown batch error';
    log.warn(
      `[一对一评估] 批次 [${batch.primaryName}] 评估失败，将用默认值填充 课程=${stageLabel} 错误=${message}`,
    );
    return {
      primaryId: batch.primaryId,
      primaryName: batch.primaryName,
      detailEvaluations: [],
      succeeded: false,
      rawText: '',
      error: message,
    };
  }
}

/** 归一化文本用于 evidence 子串匹配：去标点、压空格、转小写 */
function normalizeForEvidenceMatch(s: string): string {
  return s
    .replace(/[\s，。！？、；：""''（）()【】《》\-—…,.!?;:'"`~]/g, '')
    .toLowerCase();
}

/** 校验 AI 返回的 evidence 是否能在对话原文中找到，结果只进日志 */
function verifyEvidenceAgainstDialogue(
  detailEvals: ParsedDetailEvaluation[],
  dialogueText: string,
): { verified: number; unverified: number; unverifiedSamples: string[] } {
  const normalizedDialogue = normalizeForEvidenceMatch(dialogueText);
  let verified = 0;
  let unverified = 0;
  const unverifiedSamples: string[] = [];

  for (const e of detailEvals) {
    if (!e.evidence || e.evidence.trim().length === 0) continue;
    const normEvidence = normalizeForEvidenceMatch(e.evidence);
    if (normEvidence.length === 0) continue;
    if (normalizedDialogue.includes(normEvidence)) {
      verified += 1;
    } else {
      unverified += 1;
      if (unverifiedSamples.length < 5) {
        unverifiedSamples.push(`${e.detailId}: ${e.evidence}`);
      }
    }
  }

  return { verified, unverified, unverifiedSamples };
}

/** 合并各批评分结果，生成全局 summary/highlights/improvements/completedObjectives */
async function mergeBatchReports(
  batchResults: BatchResult[],
  totalScore: number,
  ctx: BatchSharedContext,
): Promise<{
  summary: string;
  highlights: string[];
  improvements: string[];
  completedObjectives: string[];
}> {
  const batchSummaries = batchResults
    .map((b) => {
      const items = b.detailEvaluations
        .map(
          (e) =>
            `- ${e.detailId}: 得分=${e.score} ${e.reason}${e.evidence ? ` | 依据: ${e.evidence}` : ''}`,
        )
        .join('\n');
      return `### ${b.primaryName}${b.succeeded ? '' : '（评估失败，已用默认值填充）'}\n${items || '（无评分数据）'}`;
    })
    .join('\n\n');

  const systemPrompt = `你是${ctx.directorName || '班主任'}，负责根据各指标评分结果生成整体评估报告。${ctx.styleInstruction}

## 训练场景
- 模式：${ctx.trainingContent.mode === 'roleplay' ? '角色扮演对练' : '一对一导师辅导'}
- 场景背景：${ctx.trainingContent.scenario.background}

## 训练目标
${ctx.objectiveList}

## 各指标评分结果（总分 ${totalScore}/100）
${batchSummaries}

## 你的任务
基于以上各指标评分，生成整体评估报告：
1. summary：总结评语，不超过 60 个字
2. highlights：做得好的亮点，2-3 条，每条不超过 30 个字
3. improvements：待改进之处，2-3 条，每条不超过 30 个字
4. completedObjectives：已达成的训练目标

请只输出 JSON，不要输出任何其他内容：
{
  "summary": "<总结评语>",
  "highlights": ["<亮点1>", "<亮点2>"],
  "improvements": ["<待改进1>", "<待改进2>"],
  "completedObjectives": ["<已达成目标1>"]
}`;

  try {
    const result = await callLLM(
      {
        model: ctx.languageModel,
        system: systemPrompt,
        prompt: '',
        maxOutputTokens: 512,
        temperature: 0,
      },
      'training-evaluate',
      {
        retries: 1,
        validate: (text: string) => {
          try {
            extractJsonObject(text);
            return true;
          } catch {
            return false;
          }
        },
      },
    );

    const parsed = extractJsonObject(result.text);
    log.info(`[一对一评估] 合并报告生成成功 summary长度=${typeof parsed === 'object' && parsed !== null && 'summary' in parsed ? String((parsed as Record<string, unknown>).summary).length : 0}`);
    return {
      summary: isRecord(parsed) && typeof parsed.summary === 'string' ? parsed.summary : '',
      highlights: isRecord(parsed) ? stringArrayFrom(parsed.highlights) : [],
      improvements: isRecord(parsed) ? stringArrayFrom(parsed.improvements) : [],
      completedObjectives: isRecord(parsed) ? stringArrayFrom(parsed.completedObjectives) : [],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown merge error';
    log.warn(`[一对一评估] 合并调用失败，降级处理 错误=${message}`);
    // 降级：从各批 reason 提取非空项作为 improvements
    const fallbackImprovements = batchResults
      .flatMap((b) => b.detailEvaluations)
      .map((e) => e.reason)
      .filter((r) => r.trim().length > 0)
      .slice(0, 3);
    return {
      summary: '',
      highlights: [],
      improvements:
        fallbackImprovements.length > 0
          ? fallbackImprovements
          : ['AI 合并报告生成失败，请查看明细评分'],
      completedObjectives: [],
    };
  }
}

export async function runTrainingEvaluation(
  input: Record<string, unknown>,
  options: {
    sessionUser: TrainingEvaluationSessionUser;
    headers: Headers | Record<string, string | undefined>;
  },
): Promise<TrainingEvaluationResult> {
  const startedAt = Date.now();
  const elapsedMs = () => Date.now() - startedAt;

  try {
    const {
      trainingContent,
      dialogueHistory,
      difficulty,
      directorName,
      directorStyle,
      stageId,
      sensitiveWordsHit,
      rounds,
      duration,
      messages,
      roleConfig,
      persistUserId,
      isRegenerated,
      reportIndex,
      sessionId,
    } = input as unknown as TrainingEvaluationInput & { isRegenerated?: boolean; reportIndex?: number; sessionId?: string };
    const requestedPersistUserId =
      typeof persistUserId === 'string' && persistUserId.trim().length > 0
        ? persistUserId.trim()
        : undefined;
    const effectiveUserId =
      requestedPersistUserId &&
      (requestedPersistUserId === options.sessionUser.id || options.sessionUser.role === 'admin')
        ? requestedPersistUserId
        : options.sessionUser.id;

    const sensitiveWordsPrompt = buildSensitiveWordsPrompt(sensitiveWordsHit || []);

    const sanitizedDialogueHistory = Array.isArray(dialogueHistory)
      ? dialogueHistory.filter(
          (m) =>
              isRecord(m) &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string' &&
              m.content.trim().length > 0,
        )
      : [];
    const messagesForPersistence = Array.isArray(messages)
      ? messages
          .filter(
            (m) =>
              isRecord(m) &&
              (m.role === 'user' || m.role === 'assistant' || m.role === 'system') &&
              typeof m.content === 'string' &&
              m.content.trim().length > 0,
          )
          .map((m) => ({
            role: m.role as string,
            content: (m.content as string).trim(),
            timestamp: typeof m.timestamp === 'number' ? m.timestamp : undefined,
            audioUrl: typeof m.audioUrl === 'string' ? m.audioUrl : undefined,
          }))
      : undefined;

    const persistReportIfRequested = async (report: EvaluationReportPayload) => {
      if (!stageId || !messagesForPersistence) return null;
      try {
        const saved = await persistTrainingResult({
          userId: effectiveUserId,
          stageId,
          difficulty,
          scores: report.scores,
          scoreTree: report.scoreTree,
          totalScore: report.totalScore,
          summary: report.summary,
          highlights: report.highlights,
          improvements: report.improvements,
          objectives: report.completedObjectives,
          rounds: rounds ?? Math.floor(sanitizedDialogueHistory.length / 2),
          duration: duration ?? 0,
          messages: messagesForPersistence,
          roleConfig,
          isRegenerated,
          reportIndex,
          sessionId,
        });
        log.info(
          `[一对一评估] 评估报告已在评估接口内保存 用户=${effectiveUserId} 结果ID=${saved.resultId} 会话ID=${saved.sessionId} 课程=${stageId} 保存后总耗时=${elapsedMs()}ms`,
        );

        // Update training weaknesses asynchronously so the learner can see the report immediately.
        void updateTrainingWeaknesses({
          userId: effectiveUserId,
          stageId,
          resultId: saved.resultId,
          evaluationReport: {
            totalScore: report.totalScore,
            summary: report.summary,
            improvements: report.improvements,
            highlights: report.highlights,
            scores: report.scores,
          },
          headers: options.headers,
        })
          .then((weaknessResult) => {
            log.info(
              `[一对一评估] 历史不足已更新 用户=${effectiveUserId} 课程=${stageId} 已解决=${weaknessResult.resolved} 新增=${weaknessResult.added} 总耗时=${elapsedMs()}ms`,
            );
          })
          .catch((weaknessError: unknown) => {
            const weaknessMessage =
              weaknessError instanceof Error ? weaknessError.message : 'Unknown weakness update error';
            log.warn(
              `[一对一评估] 更新历史不足失败（不影响评估结果） 用户=${effectiveUserId} 课程=${stageId} 错误=${weaknessMessage}`,
            );
          });

        return saved;
      } catch (saveError: unknown) {
        const message = saveError instanceof Error ? saveError.message : 'Unknown save error';
        log.error(
          `[一对一评估] 评估接口内保存报告失败 用户=${effectiveUserId} 课程=${stageId} 错误=${message} 总耗时=${elapsedMs()}ms`,
        );
        return null;
      }
    };

    log.info(
      `[一对一评估] 开始生成评估报告 用户=${effectiveUserId} 请求用户=${options.sessionUser.id} 课程=${stageId || '无'} 难度=${difficulty} 模式=${trainingContent.mode} 消息数=${sanitizedDialogueHistory.length} 评分维度数=${trainingContent.scoringDimensions.length} 敏感词命中数=${sensitiveWordsHit?.length ?? 0}`,
    );

    if (!sanitizedDialogueHistory.some((m) => m.role === 'user')) {
      log.warn(
        `[一对一评估] 拒绝生成评估报告：没有学员消息 用户=${effectiveUserId} 课程=${stageId || '无'}`,
      );
      throw new Error('At least one user message is required');
    }

    const dimensionList = trainingContent.scoringDimensions
      .map(
        (d, i) => `${i + 1}. ${d.name} (权重: ${(d.weight * 100).toFixed(0)}%) - ${d.description}`,
      )
      .join('\n');

    const objectiveList = trainingContent.objectives.map((o, i) => `${i + 1}. ${o}`).join('\n');

    const difficultyLabel =
      {
        easy: '温和型客户',
        medium: '质疑型客户',
        hard: '刁难型客户',
      }[difficulty] || difficulty;

    const styleInstruction =
      {
        strict: '你的点评风格严格、直接、有建设性。',
        friendly: '你的点评风格亲切、鼓励为主、温和指出不足。',
        humorous: '你的点评风格幽默风趣，用轻松的方式指出问题和优点。',
      }[directorStyle || 'friendly'] || '';

    const dialogueText = sanitizedDialogueHistory
      .map((msg) => {
        const speaker =
          msg.role === 'assistant'
            ? `客户/${trainingContent.scenario.aiRole}`
            : `学员/${trainingContent.scenario.learnerRole}`;
        return `${speaker}: ${msg.content}`;
      })
      .join('\n');

    const { model: languageModel } = await resolveModelFromHeaderValues(options.headers);

    if (typeof stageId === 'string' && stageId.trim().length > 0) {
      const scoringConfig = await getEnabledScoringConfigForStage(stageId.trim());

      if (scoringConfig) {
        const scoringDetails = flattenScoringCriteria(scoringConfig.criteria);
        const scoringModes = new Set(scoringDetails.map((detail) => detail.scoringMode));
        const scoringModeLabel =
          scoringModes.size > 1
            ? 'mixed'
            : scoringModes.has('deduction')
              ? 'deduction'
              : 'bonus';
        log.info(
          `[一对一评估] 使用后台评分配置 课程=${stageId.trim()} 配置ID=${scoringConfig.id} 配置名称="${scoringConfig.name}" 评分模式=${scoringModeLabel} 明细数=${scoringDetails.length}`,
        );
        const modeInstruction =
          '对每个 detailId 返回 score，范围 0 到该明细满分，表示学员在该项的实际表现（0=完全未做到，满分=完全做到）。不要返回负数，总分由系统代码统一计算。';

        // 按一级指标分批，并行调用大模型
        const batches = splitDetailsIntoBatches(scoringDetails);
        log.info(
          `[一对一评估] 评分明细分批 明细数=${scoringDetails.length} 批次数=${batches.length} 每批明细数=[${batches.map((b) => b.details.length).join(', ')}] 课程=${stageId.trim()}`,
        );

        const batchContext: BatchSharedContext = {
          languageModel,
          dialogueText,
          objectiveList,
          difficultyLabel,
          styleInstruction,
          directorName,
          sensitiveWordsPrompt,
          modeInstruction,
          configName: scoringConfig.name,
          tagLabel: scoringConfig.tag?.name || scoringConfig.tagId,
          trainingContent,
          referenceScript: trainingContent.referenceScript || '',
        };

        log.info(
          `[一对一评估] 开始并行调用大模型生成评分树报告 课程=${stageId.trim()} 批次数=${batches.length} 对话字符数=${dialogueText.length}`,
        );

        const settledResults = await Promise.allSettled(
          batches.map((batch) => evaluateSingleBatch(batch, batchContext, stageId.trim())),
        );

        // 汇总各批结果（evaluateSingleBatch 内部已捕获异常，这里防御性处理 reject）
        const allBatchResults: BatchResult[] = settledResults.map((r, i) => {
          if (r.status === 'fulfilled') return r.value;
          const batch = batches[i];
          return {
            primaryId: batch.primaryId,
            primaryName: batch.primaryName,
            detailEvaluations: [],
            succeeded: false,
            rawText: '',
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          };
        });

        const successCount = allBatchResults.filter((b) => b.succeeded).length;
        const failCount = allBatchResults.length - successCount;
        const allDetailEvaluations = allBatchResults.flatMap((b) => b.detailEvaluations);

        log.info(
          `[一对一评估] 批次评估完成 课程=${stageId.trim()} 成功批=${successCount} 失败批=${failCount} 已收集明细评分=${allDetailEvaluations.length}/${scoringDetails.length} 总耗时=${elapsedMs()}ms`,
        );

        // evidence 真实性后校验（只进日志，不影响评分）
        const evidenceCheck = verifyEvidenceAgainstDialogue(allDetailEvaluations, dialogueText);
        if (evidenceCheck.unverified > 0) {
          log.warn(
            `[一对一评估] evidence 真实性校验 课程=${stageId.trim()} 已验证=${evidenceCheck.verified} 未匹配=${evidenceCheck.unverified} 样本=${JSON.stringify(evidenceCheck.unverifiedSamples)}`,
          );
        } else {
          log.info(
            `[一对一评估] evidence 真实性校验通过 课程=${stageId.trim()} 已验证=${evidenceCheck.verified} 未匹配=0`,
          );
        }

        // 系统聚合：复用 buildScoringResultSnapshot，缺失项按 scoringMode 默认填充
        const { scoreTree, scores } = buildScoringResultSnapshot({
          configId: scoringConfig.id,
          configName: scoringConfig.name,
          tagId: scoringConfig.tagId,
          criteria: scoringConfig.criteria,
          detailScores: allDetailEvaluations,
        });
        log.info(
          `[一对一评估] 评分树聚合完成 课程=${stageId.trim()} 总分=${scoreTree.totalScore} 平铺分项数=${scores.length} 一级指标数=${scoreTree.primary.length} 总耗时=${elapsedMs()}ms`,
        );

        // 合并调用：生成全局 summary/highlights/improvements/completedObjectives
        const merged = await mergeBatchReports(allBatchResults, scoreTree.totalScore, batchContext);
        log.info(
          `[一对一评估] 合并报告生成完成 课程=${stageId.trim()} 总耗时=${elapsedMs()}ms`,
        );

        const responsePayload: EvaluationReportPayload = {
          scores,
          scoreTree,
          totalScore: scoreTree.totalScore,
          summary: merged.summary,
          highlights: merged.highlights,
          improvements: merged.improvements,
          completedObjectives: merged.completedObjectives,
        };
        const saved = await persistReportIfRequested(responsePayload);

        return {
          ...responsePayload,
          saved: Boolean(saved),
          resultId: saved?.resultId,
          sessionId: saved?.sessionId,
        };
      }

      log.info(`[一对一评估] 未找到启用的后台评分配置 课程=${stageId.trim()}`);
    }

    const systemPrompt = `你是${directorName || '班主任'}，负责评估学员的一对一训练表现。${styleInstruction}

## 训练场景
- 模式：${trainingContent.mode === 'roleplay' ? '角色扮演对练' : '一对一导师辅导'}
- 场景背景：${trainingContent.scenario.background}
- AI角色：${trainingContent.scenario.aiRole}
- 学员角色：${trainingContent.scenario.learnerRole}
- 难度：${difficultyLabel}

## 训练目标
${objectiveList}

## 评分维度
${dimensionList}

${trainingContent.referenceScript ? `## 参考话术\n${trainingContent.referenceScript}` : ''}
${sensitiveWordsPrompt}

## 你的任务
分析以下对话记录，从各个评分维度为学员打分（0-100），并给出：
1. 每个维度的分数和具体点评
2. 总结评语
3. 亮点（做得好的地方）
4. 待改进之处
5. 哪些训练目标已达成

请严格按以下 JSON 格式输出，不要输出任何其他内容：
{
  "scores": [
    { "dimensionId": "<维度ID>", "dimensionName": "<维度名>", "score": <0-100>, "feedback": "<该维度点评>" }
  ],
  "summary": "<总结评语>",
  "highlights": ["<亮点1>", "<亮点2>"],
  "improvements": ["<待改进1>", "<待改进2>"],
  "completedObjectives": ["<已达成目标1>"]
}`;

    log.info(
      `[一对一评估] 调用大模型生成默认维度报告 课程=${stageId || '无'} 对话字符数=${dialogueText.length}`,
    );
    const defaultUserPrompt = `## 对话记录\n\n${dialogueText}`;
    logEvaluationPrompt('OneOnOne Default Evaluation', systemPrompt, defaultUserPrompt);
    const defaultMaxOutputTokens = trainingContent.scoringDimensions.length * 250 + 512;
    const result = await callLLM(
      {
        model: languageModel,
        system: systemPrompt,
        prompt: defaultUserPrompt,
        maxOutputTokens: defaultMaxOutputTokens,
        temperature: 0,
      },
      'training-evaluate',
      {
        retries: 2,
        validate: (text: string) => {
          try {
            const parsed = extractJsonObject(text);
            return isRecord(parsed) && Array.isArray(parsed.scores);
          } catch {
            return false;
          }
        },
      },
    );
    log.info(
      `[一对一评估] 大模型返回默认维度报告 课程=${stageId || '无'} 返回字符数=${result.text.length}`,
    );
    logEvaluationText('OneOnOne Default Evaluation Raw Response', result.text);

    // Parse AI response
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      const evaluation = JSON.parse(jsonMatch[0]) as {
        scores: DimensionScore[];
        summary: string;
        highlights: string[];
        improvements: string[];
        completedObjectives: string[];
      };
      logEvaluationText(
        'OneOnOne Default Evaluation Parsed Scores',
        JSON.stringify(evaluation.scores || [], null, 2),
      );
      const scores = sanitizeDefaultScores(trainingContent.scoringDimensions, evaluation.scores);

      // Calculate weighted total score
      const totalScore = Math.round(
        scores.reduce((sum, s) => {
          const dim = trainingContent.scoringDimensions.find(
            (d) => d.id === s.dimensionId || d.name === s.dimensionName,
          );
          const weight = dim?.weight || 1 / scores.length;
          return sum + s.score * weight;
        }, 0),
      );
      log.info(
        `[一对一评估] 默认维度报告解析成功 课程=${stageId || '无'} 总分=${totalScore} 分项数=${scores.length} 总耗时=${elapsedMs()}ms`,
      );

      const responsePayload: EvaluationReportPayload = {
        scores,
        totalScore,
        summary: evaluation.summary,
        highlights: evaluation.highlights,
        improvements: evaluation.improvements,
        completedObjectives: evaluation.completedObjectives,
      };
      const saved = await persistReportIfRequested(responsePayload);

      return {
        ...responsePayload,
        saved: Boolean(saved),
        resultId: saved?.resultId,
        sessionId: saved?.sessionId,
      };
    } catch (parseError: unknown) {
      const parseMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
      log.warn(
        `[一对一评估] 默认维度报告解析失败 课程=${stageId || '无'} 返回字符数=${result.text.length} 错误=${parseMessage} 总耗时=${elapsedMs()}ms`,
      );
      // If parsing fails, return raw text as summary
      const responsePayload: EvaluationReportPayload = {
        scores: trainingContent.scoringDimensions.map((d) => ({
          dimensionId: d.id,
          dimensionName: d.name,
          score: 0,
          feedback: '评分解析失败',
        })),
        totalScore: 0,
        summary: result.text,
        highlights: [],
        improvements: ['AI 评分解析失败，请查看原始评语'],
        completedObjectives: [],
      };
      const saved = await persistReportIfRequested(responsePayload);

      return {
        ...responsePayload,
        saved: Boolean(saved),
        resultId: saved?.resultId,
        sessionId: saved?.sessionId,
      };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error(`[一对一评估] 生成评估报告失败 错误=${message} 总耗时=${elapsedMs()}ms`);
    throw new Error(message);
  }
}
