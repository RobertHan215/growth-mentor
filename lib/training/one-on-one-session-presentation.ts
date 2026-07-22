export type SensitiveWordSource = 'user' | 'ai';

export interface SensitiveWordNotice {
  source: SensitiveWordSource;
  matched: string[];
  category?: string;
}

export interface ClassDirectorOpeningInput {
  name?: string;
  debtAmount?: number;
  debtDays?: number;
  monthlyPayment?: number;
  totalInstallments?: number;
  paidInstallments?: number;
}

export interface OneOnOneOpeningSequenceMessage {
  id: string;
  role: 'system';
  content: string;
  timestamp: number;
}

export interface OneOnOneOpeningSequenceInput {
  opening: string;
  startedAt: number;
  whoSpeaksFirst?: 'user' | 'ai';
  aiFirstMessage?: string;
}

export interface OneOnOneOpeningSequence {
  messages: OneOnOneOpeningSequenceMessage[];
  spokenMessageId: string;
  spokenText: string;
}

function formatCategory(category?: string, separator = '，'): string {
  const normalized = category?.trim();
  return normalized ? `${separator}涉及${normalized}` : '';
}

function formatSensitiveWords(words: string[]): string {
  return words.length > 0 ? `「${words.join('、')}」` : '敏感表达';
}

export function buildClassDirectorOpening(input: ClassDirectorOpeningInput): string {
  const facts: string[] = [];
  if (input.name?.trim()) facts.push(`本次对练对象为${input.name.trim()}`);
  if (input.debtAmount !== undefined) {
    facts.push(`逾期金额 ${input.debtAmount.toLocaleString()} 元`);
  }
  if (input.debtDays !== undefined) facts.push(`已逾期 ${input.debtDays} 天`);
  if (
    input.monthlyPayment !== undefined ||
    input.totalInstallments !== undefined ||
    input.paidInstallments !== undefined
  ) {
    facts.push(
      [
        input.monthlyPayment !== undefined
          ? `月供 ${input.monthlyPayment.toLocaleString()} 元`
          : '',
        input.totalInstallments !== undefined ? `共 ${input.totalInstallments} 期` : '',
        input.paidInstallments !== undefined ? `已还 ${input.paidInstallments} 期` : '',
      ]
        .filter(Boolean)
        .join('，'),
    );
  }
  return `${facts.length > 0 ? facts.join('，') : '本次一对一对练已准备完成'}。请开始沟通。`;
}

export function buildOneOnOneOpeningSequence({
  opening,
  startedAt,
}: OneOnOneOpeningSequenceInput): OneOnOneOpeningSequence {
  const openingMsgId = `msg-system-${startedAt}`;

  return {
    messages: [
      {
        id: openingMsgId,
        role: 'system',
        content: opening,
        timestamp: startedAt,
      },
    ],
    spokenMessageId: openingMsgId,
    spokenText: opening,
  };
}

export function buildSensitiveWordBanner(notice: SensitiveWordNotice): string {
  const formatted = `${formatSensitiveWords(notice.matched)}${formatCategory(notice.category)}`;
  if (notice.source === 'ai') {
    return `系统提醒：AI 回复包含敏感词${formatted}，本次对话已终止。`;
  }
  return `用词不当提醒：您的表达包含敏感词${formatted}，请修改后重新发送。`;
}

export function buildSensitiveWordWhiteboardContent(notice: SensitiveWordNotice): string {
  const formatted = `${formatSensitiveWords(notice.matched)}${formatCategory(notice.category)}`;
  if (notice.source === 'ai') {
    return `系统提醒：AI 回复命中敏感词${formatted}，该回复已终止并移除。`;
  }
  return `用词不当提醒：学员发言命中敏感词${formatted}，已拦截；请改用合规、专业表达。`;
}

export function buildSensitiveWordsPrompt(notices: SensitiveWordNotice[]): string {
  if (notices.length === 0) return '';

  const formatted = notices
    .map((notice) => {
      const source = notice.source === 'user' ? '学员' : 'AI';
      return `- 由【${source}】触发的敏感词: ${notice.matched.join(', ')}${formatCategory(notice.category, '；')}`;
    })
    .join('\n');

  return `
## 敏感词违规记录 (重要)
在本次对练中，系统检测到以下敏感词/违规词被使用：
${formatted}

【重要评估要求】：
在对练中触犯敏感词属于严重违规。请在“总结评语 (summary)”中严肃批评指出此违规行为；并在“待改进 (improvements)”中列出要求学员避免使用这些敏感词；同时，在各个相关维度的评分或明细评分中，视情节严重性扣减相应的分数。
`;
}
