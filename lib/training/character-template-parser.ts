import type { CharacterDimension, CharacterProfile } from '@/lib/types/ai-character-template';

export interface ParsedCharacterTemplateShape {
  name?: string;
  description?: string;
  personalityType?: string;
  profile?: CharacterProfile;
  dimensions?: CharacterDimension[];
}

const CUSTOMER_SITUATION_ID = 'customerSituation';
const CUSTOMER_SITUATION_LABEL = '客户情况';
const CUSTOMER_SITUATION_DESCRIPTION = '客户还款合同、月供、总期数、已还期数和当前还款压力';

const CUSTOMER_SITUATION_SOURCE_LABELS = ['客户情况', '角色画像'];

const TEMPLATE_FIELD_LABELS = [
  '角色画像',
  '客户情况',
  '触发原因',
  '沟通表现',
  '车辆状态',
  '资产线索',
  '催收策略',
  '结束语提示词',
  '结束提示词',
  '还款口头禅',
  '口头禅',
  '常说话术',
  '常用表达',
  '角色名称',
  '类型标签',
  '描述',
];

function normalizeLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

function isTemplateFieldStart(line: string): boolean {
  const normalized = normalizeLine(line);
  return TEMPLATE_FIELD_LABELS.some((label) =>
    new RegExp(`^${label}(?:\\s*[:：]|\\b|\\s)`).test(normalized),
  );
}

function dedupeTextSegments(segments: string[]): string[] {
  const unique: string[] = [];

  segments.forEach((segment) => {
    const normalized = normalizeLine(segment);
    if (!normalized) return;
    if (unique.some((item) => item.includes(normalized) || normalized.includes(item))) return;
    unique.push(normalized);
  });

  return unique;
}

export function extractCustomerSituationText(text: string): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const segments: string[] = [];

  lines.forEach((line, index) => {
    for (const label of CUSTOMER_SITUATION_SOURCE_LABELS) {
      const inlineMatch = line.match(new RegExp(`^${label}\\s*[:：]\\s*(.+)$`));
      if (inlineMatch?.[1]?.trim()) {
        segments.push(inlineMatch[1].trim());
        return;
      }

      const emptyLabelMatch = line.match(new RegExp(`^${label}\\s*[:：]?\\s*$`));
      if (!emptyLabelMatch) continue;

      const block: string[] = [];
      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = lines[nextIndex];
        if (isTemplateFieldStart(nextLine)) break;
        block.push(nextLine);
      }
      if (block.length > 0) {
        segments.push(block.join(' '));
      }
    }
  });

  const uniqueSegments = dedupeTextSegments(segments);
  return uniqueSegments.length > 0 ? uniqueSegments.join('\n') : undefined;
}

function mergeTextContent(primary: string, secondary: string): string {
  const compact = (value: string) => normalizeLine(value).replace(/[，。；;、,:：\s]/g, '');
  const [primaryText, secondaryText] = dedupeTextSegments([primary, secondary]);
  if (!primaryText) return secondaryText || '';
  if (!secondaryText) return primaryText;
  if (compact(primaryText).includes(compact(secondaryText))) return primaryText;
  if (compact(secondaryText).includes(compact(primaryText))) return secondaryText;
  return `${primaryText}\n${secondaryText}`;
}

function mergeCustomerSituationDimension(
  dimensions: CharacterDimension[] | undefined,
  customerSituation: string,
): CharacterDimension[] {
  const source = dimensions ? [...dimensions] : [];
  const existingIndex = source.findIndex(
    (dimension) =>
      dimension.id === CUSTOMER_SITUATION_ID || dimension.label.trim() === CUSTOMER_SITUATION_LABEL,
  );

  if (existingIndex >= 0) {
    const existing = source[existingIndex];
    source[existingIndex] = {
      ...existing,
      id: existing.id || CUSTOMER_SITUATION_ID,
      label: existing.label || CUSTOMER_SITUATION_LABEL,
      description: existing.description || CUSTOMER_SITUATION_DESCRIPTION,
      content: mergeTextContent(customerSituation, existing.content),
      enabled: existing.enabled,
    };
    return source.map((dimension, index) => ({ ...dimension, order: index + 1 }));
  }

  return [
    ...source,
    {
      id: CUSTOMER_SITUATION_ID,
      label: CUSTOMER_SITUATION_LABEL,
      description: CUSTOMER_SITUATION_DESCRIPTION,
      content: customerSituation,
      enabled: true,
      order: source.length + 1,
    },
  ];
}

export function applyCharacterTemplateTextFallbacks(
  parsed: ParsedCharacterTemplateShape,
  sourceText: string,
): ParsedCharacterTemplateShape {
  const customerSituation = extractCustomerSituationText(sourceText);
  if (!customerSituation) {
    return parsed;
  }

  return {
    ...parsed,
    profile: {
      ...parsed.profile,
      customerSituation,
    },
    dimensions: mergeCustomerSituationDimension(parsed.dimensions, customerSituation),
  };
}
