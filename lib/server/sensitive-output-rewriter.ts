import type {
  SensitiveWordCheckResult,
  SensitiveWordMatch,
} from '@/lib/server/sensitive-word-checker';

interface TextSegment {
  text: string;
  start: number;
  end: number;
}

interface ViolationDetail {
  sentence: string;
  matches: SensitiveWordMatch[];
}

export interface SensitiveOutputRewriteOptions {
  text: string;
  checkText: (text: string) => Promise<SensitiveWordCheckResult>;
  rewriteText: (prompt: string) => Promise<string>;
  maxRewriteAttempts?: number;
}

export interface SensitiveOutputRewriteResult {
  text: string;
  rewritten: boolean;
  masked: boolean;
  initialCheck: SensitiveWordCheckResult;
  finalCheck?: SensitiveWordCheckResult;
}

function getMatches(result: SensitiveWordCheckResult): SensitiveWordMatch[] {
  if (result.matches && result.matches.length > 0) {
    return result.matches;
  }

  if (!result.matched) {
    return [];
  }

  return [
    {
      wordId: result.wordId || '',
      matched: result.matched,
      ...(result.category ? { category: result.category } : {}),
    },
  ];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitTextSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const pattern = /[^。！？!?；;\n]+[。！？!?；;]?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const segmentText = match[0];
    if (!segmentText.trim()) continue;
    segments.push({
      text: segmentText,
      start: match.index,
      end: match.index + segmentText.length,
    });
  }

  if (segments.length === 0 && text.trim()) {
    segments.push({ text, start: 0, end: text.length });
  }

  return segments;
}

function uniqueMatches(matches: SensitiveWordMatch[]): SensitiveWordMatch[] {
  const seen = new Set<string>();
  const unique: SensitiveWordMatch[] = [];

  for (const match of matches) {
    const key = `${match.wordId}:${match.matched}:${match.category ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(match);
  }

  return unique;
}

function buildViolationDetails(text: string, matches: SensitiveWordMatch[]): ViolationDetail[] {
  const lowerText = text.toLowerCase();
  const segments = splitTextSegments(text);
  const details: ViolationDetail[] = [];

  for (const segment of segments) {
    const segmentMatches = matches.filter((match) => {
      const needle = match.matched.toLowerCase();
      if (!needle) return false;
      let index = lowerText.indexOf(needle);

      while (index !== -1) {
        if (index >= segment.start && index < segment.end) {
          return true;
        }
        index = lowerText.indexOf(needle, index + needle.length);
      }

      return false;
    });

    if (segmentMatches.length > 0) {
      details.push({
        sentence: segment.text.trim(),
        matches: uniqueMatches(segmentMatches),
      });
    }
  }

  if (details.length === 0 && matches.length > 0) {
    details.push({ sentence: text.trim(), matches: uniqueMatches(matches) });
  }

  return details;
}

export function buildSensitiveRewritePrompt(
  originalText: string,
  matches: SensitiveWordMatch[],
): string {
  const details = buildViolationDetails(originalText, matches);
  const violationLines = details
    .map((detail, index) => {
      const matchedWords = detail.matches.map((match) => `「${match.matched}」`).join('、');
      const categories = [
        ...new Set(detail.matches.map((match) => match.category).filter(Boolean)),
      ].join('、');
      return [
        `${index + 1}. 违规语句：${detail.sentence}`,
        `   命中词：${matchedWords}`,
        categories ? `   分类：${categories}` : undefined,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return `请改写下面这段 AI 回复，保持原意和对话语气基本不变，但必须避开已命中的敏感表达。

违规位置：
${violationLines}

要求：
1. 只返回完整改写后的 AI 回复，不要解释。
2. 不要再输出上述命中词，也不要用空格、符号、谐音、拆字等方式绕过。
3. 未违规的内容尽量保持不变。
4. 如果原文包含 [SESSION_COMPLETE:...] 或 [BOARD:...] 控制标签，除非标签内容包含命中词，否则原样保留。

原始 AI 回复：
${originalText}`;
}

export function maskSensitiveWords(text: string, matches: SensitiveWordMatch[]): string {
  const words = [...new Set(matches.map((match) => match.matched).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  let result = text;

  for (const word of words) {
    result = result.replace(new RegExp(escapeRegExp(word), 'gi'), '***');
  }

  return result;
}

export async function rewriteSensitiveOutput(
  options: SensitiveOutputRewriteOptions,
): Promise<SensitiveOutputRewriteResult> {
  const maxRewriteAttempts = options.maxRewriteAttempts ?? 1;
  const initialCheck = await options.checkText(options.text);

  if (!initialCheck.hit) {
    return {
      text: options.text,
      rewritten: false,
      masked: false,
      initialCheck,
    };
  }

  let currentText = options.text;
  let currentCheck = initialCheck;
  let rewritten = false;

  for (let attempt = 0; attempt < maxRewriteAttempts; attempt++) {
    const matches = getMatches(currentCheck);
    if (matches.length === 0) break;

    try {
      const prompt = buildSensitiveRewritePrompt(currentText, matches);
      const nextText = (await options.rewriteText(prompt)).trim();
      if (!nextText) break;

      rewritten = true;
      currentText = nextText;
      currentCheck = await options.checkText(currentText);

      if (!currentCheck.hit) {
        return {
          text: currentText,
          rewritten,
          masked: false,
          initialCheck,
          finalCheck: currentCheck,
        };
      }
    } catch {
      break;
    }
  }

  const finalMatches = getMatches(currentCheck);
  return {
    text: finalMatches.length > 0 ? maskSensitiveWords(currentText, finalMatches) : currentText,
    rewritten,
    masked: finalMatches.length > 0,
    initialCheck,
    finalCheck: currentCheck,
  };
}

export function getSensitiveWordMatches(result: SensitiveWordCheckResult): SensitiveWordMatch[] {
  return getMatches(result);
}
