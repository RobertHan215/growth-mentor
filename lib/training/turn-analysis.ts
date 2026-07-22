import type { TrainingBoardEntryType } from '@/lib/training/control-tags';

export interface TrainingTurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TrainingTurnAnalysisInput {
  aiRoleName: string;
  userRoleName: string;
  latestUserMessage: string;
  latestAiMessage: string;
  closingPrompt?: string;
  recentMessages?: TrainingTurnMessage[];
  round?: number;
}

export interface TrainingTurnAnalysisResult {
  sessionComplete: {
    complete: boolean;
    reason: string;
  };
  boardEntries: Array<{
    type: TrainingBoardEntryType;
    content: string;
  }>;
  roleConfusion: {
    detected: boolean;
    reason: string;
  };
}

const VALID_BOARD_TYPES = new Set<TrainingBoardEntryType>([
  'info',
  'data',
  'commitment',
  'formula',
  'note',
]);

const CLOSING_TIME_KEYWORDS = [
  '今天下午',
  '今天',
  '下午',
  '晚上',
  '明天',
  '后天',
  '两天',
  '两天后',
  '本周',
  '周末',
  '月底',
];

const CLOSING_ACTION_KEYWORDS = [
  '想办法',
  '周转',
  '找朋友',
  '找亲戚',
  '处理',
  '还款',
  '补上',
  '补齐',
  '安排',
  '到账',
  '答复',
  '先还',
  '先处理',
];

export function emptyTurnAnalysisResult(): TrainingTurnAnalysisResult {
  return {
    sessionComplete: {
      complete: false,
      reason: '',
    },
    boardEntries: [],
    roleConfusion: {
      detected: false,
      reason: '',
    },
  };
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function compactText(value: string): string {
  return value.replace(/[，。；;、,.!?！？:："'“”‘’（）()\[\]\s]/g, '').toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function extractClosingPromptTokens(closingPrompt: string): string[] {
  const phraseTokens = closingPrompt
    .split(/[，。；;、,.!?！？:：\s]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  const keywordTokens = [...CLOSING_TIME_KEYWORDS, ...CLOSING_ACTION_KEYWORDS].filter((keyword) =>
    closingPrompt.includes(keyword),
  );

  return unique([...phraseTokens, ...keywordTokens]);
}

export function detectClosingPromptCompletion({
  closingPrompt,
  latestAiMessage,
}: {
  closingPrompt?: string;
  latestAiMessage?: string;
}): { complete: boolean; reason: string; matchedTokens: string[] } {
  const prompt = normalizeText(closingPrompt);
  const aiMessage = normalizeText(latestAiMessage);
  if (!prompt || !aiMessage) {
    return { complete: false, reason: '', matchedTokens: [] };
  }

  const compactPrompt = compactText(prompt);
  const compactMessage = compactText(aiMessage);
  if (compactPrompt.length >= 6 && compactMessage.includes(compactPrompt)) {
    return {
      complete: true,
      reason: '客户已表达角色配置中的收尾承诺话术',
      matchedTokens: [prompt],
    };
  }

  const tokens = extractClosingPromptTokens(prompt);
  const matchedTokens = tokens.filter((token) => compactMessage.includes(compactText(token)));
  const promptHasTime = CLOSING_TIME_KEYWORDS.some((keyword) => prompt.includes(keyword));
  const hasMatchedTime = CLOSING_TIME_KEYWORDS.some((keyword) =>
    matchedTokens.some((token) => token.includes(keyword)),
  );
  const promptActionTokens = CLOSING_ACTION_KEYWORDS.filter((keyword) => prompt.includes(keyword));
  const matchedActionTokens = promptActionTokens.filter((keyword) =>
    compactMessage.includes(compactText(keyword)),
  );
  const hasEnoughAction =
    promptActionTokens.length === 0 ||
    matchedActionTokens.length >= Math.min(2, promptActionTokens.length);
  const requiredMatches = Math.max(2, Math.ceil(tokens.length * 0.6));

  if (
    tokens.length > 0 &&
    matchedTokens.length >= requiredMatches &&
    (!promptHasTime || hasMatchedTime) &&
    hasEnoughAction
  ) {
    return {
      complete: true,
      reason: `客户回复已接近角色收尾话术：${matchedTokens.join('、')}`,
      matchedTokens,
    };
  }

  if (
    matchedTokens.length >= 2 &&
    (!promptHasTime || hasMatchedTime) &&
    hasEnoughAction &&
    matchedActionTokens.length > 0
  ) {
    return {
      complete: true,
      reason: `客户回复已接近角色收尾话术：${matchedTokens.join('、')}`,
      matchedTokens,
    };
  }

  return { complete: false, reason: '', matchedTokens };
}

function normalizeBoardType(value: unknown): TrainingBoardEntryType {
  return typeof value === 'string' && VALID_BOARD_TYPES.has(value as TrainingBoardEntryType)
    ? (value as TrainingBoardEntryType)
    : 'note';
}

export function normalizeTurnAnalysisResult(value: unknown): TrainingTurnAnalysisResult {
  if (!value || typeof value !== 'object') {
    return emptyTurnAnalysisResult();
  }

  const raw = value as Record<string, unknown>;
  const rawSessionComplete =
    raw.sessionComplete && typeof raw.sessionComplete === 'object'
      ? (raw.sessionComplete as Record<string, unknown>)
      : {};
  const rawRoleConfusion =
    raw.roleConfusion && typeof raw.roleConfusion === 'object'
      ? (raw.roleConfusion as Record<string, unknown>)
      : {};
  const rawBoardEntries = Array.isArray(raw.boardEntries) ? raw.boardEntries : [];

  const boardEntries = rawBoardEntries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const rawEntry = entry as Record<string, unknown>;
      const content = normalizeText(rawEntry.content).slice(0, 30);
      if (!content) return null;
      return {
        type: normalizeBoardType(rawEntry.type),
        content,
      };
    })
    .filter((entry): entry is TrainingTurnAnalysisResult['boardEntries'][number] =>
      Boolean(entry),
    );

  return {
    sessionComplete: {
      complete: rawSessionComplete.complete === true,
      reason: normalizeText(rawSessionComplete.reason),
    },
    boardEntries,
    roleConfusion: {
      detected: rawRoleConfusion.detected === true,
      reason: normalizeText(rawRoleConfusion.reason),
    },
  };
}

export function buildTurnAnalysisPrompt(input: TrainingTurnAnalysisInput): string {
  const recentMessages = (input.recentMessages || [])
    .slice(-8)
    .map((message) => {
      const roleName = message.role === 'assistant' ? input.aiRoleName : input.userRoleName;
      return `${roleName}: ${message.content}`;
    })
    .join('\n');

  return `请分析一对一对练的最新回合，只返回 JSON，不要输出 markdown。

角色绑定：
- AI 扮演：${input.aiRoleName}
- 用户扮演：${input.userRoleName}

最近对话：
${recentMessages || '无'}

最新用户消息（${input.userRoleName}）：
${input.latestUserMessage}

最新 AI 回复（${input.aiRoleName}）：
${input.latestAiMessage}
${input.closingPrompt?.trim() ? `
角色收尾承诺话术：
${input.closingPrompt.trim()}
` : ''}

分析任务：
1. 判断本轮后是否应该提示结束对练。只有在双方已达成明确结论/承诺/拒绝，或用户明确告别时，complete 才为 true。
${input.closingPrompt?.trim() ? '   - 如果最新 AI 回复已经表达或语义接近“角色收尾承诺话术”，也可视为已形成收尾承诺。' : ''}
2. 提取本轮值得写入白板的信息。只提取金额、日期、天数、利率、规则、承诺、关键备注。没有就返回空数组。
3. 检查 AI 是否混淆角色。只要 AI 扮演了「${input.userRoleName}」、替用户说话、或把“我”用成用户身份，就标记 detected=true。

返回 JSON 格式：
{
  "sessionComplete": { "complete": false, "reason": "" },
  "boardEntries": [{ "type": "info|data|commitment|formula|note", "content": "不超过30字" }],
  "roleConfusion": { "detected": false, "reason": "" }
}`;
}
