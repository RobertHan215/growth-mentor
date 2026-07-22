import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelWithDefaults } from '@/lib/server/resolve-model';
import { applyCharacterTemplateTextFallbacks } from '@/lib/training/character-template-parser';
import type { CharacterDimension, CharacterProfile } from '@/lib/types/ai-character-template';

interface ParsedCharacterTemplate {
  name?: string;
  description?: string;
  personalityType?: string;
  profile?: CharacterProfile;
  dimensions?: CharacterDimension[];
}

function adminOnly(session: Awaited<ReturnType<typeof getServerSession>>) {
  const role = (session as { user?: { role?: string } } | null)?.user?.role;
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return undefined;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  if (start === -1) {
    throw new Error('AI 返回内容缺少 JSON 对象');
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

  throw new Error('AI 返回的 JSON 对象不完整');
}

function normalizeExistingDimensions(value: unknown): CharacterDimension[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const label = stringValue(item.label);
      if (!label) return null;

      return {
        id: stringValue(item.id) || `dimension-${index + 1}`,
        label,
        description: stringValue(item.description),
        content: stringValue(item.content),
        order: Number(item.order) || index + 1,
        enabled: booleanValue(item.enabled, true),
      };
    })
    .filter((item): item is CharacterDimension => item !== null);
}

function normalizeProfile(value: unknown): CharacterProfile | undefined {
  if (!isRecord(value)) return undefined;

  const profile: CharacterProfile = {};
  const name = stringValue(value.name);
  const gender = stringValue(value.gender);
  const occupation = stringValue(value.occupation);
  const customerSituation = stringValue(value.customerSituation);
  const debtReason = stringValue(value.debtReason);
  const familyStatus = stringValue(value.familyStatus);
  const catchphrases = stringValue(value.catchphrases);
  const closingPrompt = stringValue(value.closingPrompt);
  const age = numberValue(value.age);
  const monthlyIncome = numberValue(value.monthlyIncome);
  const monthlyPayment = numberValue(value.monthlyPayment);
  const totalInstallments = numberValue(value.totalInstallments);
  const paidInstallments = numberValue(value.paidInstallments);
  const debtAmount = numberValue(value.debtAmount);
  const debtDays = numberValue(value.debtDays);

  if (name) profile.name = name;
  if (gender) profile.gender = gender;
  if (occupation) profile.occupation = occupation;
  if (customerSituation) profile.customerSituation = customerSituation;
  if (debtReason) profile.debtReason = debtReason;
  if (familyStatus) profile.familyStatus = familyStatus;
  if (catchphrases) profile.catchphrases = catchphrases;
  if (closingPrompt) profile.closingPrompt = closingPrompt;
  if (age !== undefined) profile.age = age;
  if (monthlyIncome !== undefined) profile.monthlyIncome = monthlyIncome;
  if (monthlyPayment !== undefined) profile.monthlyPayment = monthlyPayment;
  if (totalInstallments !== undefined) profile.totalInstallments = totalInstallments;
  if (paidInstallments !== undefined) profile.paidInstallments = paidInstallments;
  if (debtAmount !== undefined) profile.debtAmount = debtAmount;
  if (debtDays !== undefined) profile.debtDays = debtDays;

  return Object.keys(profile).length > 0 ? profile : undefined;
}

function normalizeDimensions(value: unknown, existing: CharacterDimension[]): CharacterDimension[] {
  const source = isRecord(value) && Array.isArray(value.dimensions) ? value.dimensions : [];
  const parsed = source
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const label = stringValue(item.label);
      if (!label) return null;

      return {
        id: stringValue(item.id) || `dimension-${index + 1}`,
        label,
        description: stringValue(item.description) || label,
        content: stringValue(item.content),
        order: index + 1,
        enabled: booleanValue(item.enabled, true),
      };
    })
    .filter((item): item is CharacterDimension => item !== null)
    .slice(0, 20);

  if (parsed.length === 0) {
    return [];
  }

  if (existing.length === 0) {
    return parsed;
  }

  const updates = new Map<string, CharacterDimension>();
  parsed.forEach((dimension) => {
    updates.set(dimension.id, dimension);
    updates.set(dimension.label, dimension);
  });

  const usedParsed = new Set<CharacterDimension>();
  const merged = existing.map((dimension, index) => {
    const update = updates.get(dimension.id) ?? updates.get(dimension.label);
    if (!update) {
      return { ...dimension, order: index + 1 };
    }

    usedParsed.add(update);
    return {
      ...dimension,
      label: update.label || dimension.label,
      description: update.description || dimension.description,
      content: update.content || dimension.content,
      enabled: update.enabled,
      order: index + 1,
    };
  });

  parsed.forEach((dimension) => {
    if (usedParsed.has(dimension)) return;
    merged.push({
      ...dimension,
      order: merged.length + 1,
    });
  });

  return merged.slice(0, 20);
}

function normalizeTemplate(value: unknown, existingDimensions: CharacterDimension[]): ParsedCharacterTemplate {
  if (!isRecord(value)) {
    throw new Error('AI 返回内容不是有效对象');
  }

  const profile = normalizeProfile(value.profile);
  const dimensions = normalizeDimensions(value, existingDimensions);

  return {
    name: stringValue(value.name) || undefined,
    description: stringValue(value.description) || undefined,
    personalityType: stringValue(value.personalityType) || undefined,
    profile,
    dimensions: dimensions.length > 0 ? dimensions : undefined,
  };
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const body = await req.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }

    const text = stringValue(body.text);
    if (!text) {
      return NextResponse.json({ error: '请粘贴需要识别的模板文本' }, { status: 400 });
    }

    const existingDimensions = normalizeExistingDimensions(body.dimensions);
    const { model } = await resolveModelWithDefaults({});

    const result = await callLLM(
      {
        model,
        system: `你是一个催收业务 AI 角色模板信息抽取专家。用户会粘贴半结构化文本，可能包含重复字段、顺序混乱、缺少冒号或多段“客户情况”。你只负责识别、合并和结构化，不要编造原文没有的事实。

输出必须是严格 JSON，不要包含 Markdown 代码块或解释文字：
{
  "name": "角色模板名称",
  "description": "一句话角色描述",
  "personalityType": "类型标签",
  "profile": {
    "name": "",
    "age": null,
    "gender": "",
    "occupation": "",
    "monthlyIncome": null,
    "monthlyPayment": null,
    "totalInstallments": null,
    "paidInstallments": null,
    "customerSituation": "",
    "debtAmount": null,
    "debtDays": null,
    "debtReason": "",
    "familyStatus": "",
    "catchphrases": "",
    "closingPrompt": ""
  },
  "dimensions": [
    {
      "id": "triggerReason",
      "label": "触发原因",
      "description": "维度描述",
      "content": "维度内容",
      "enabled": true
    }
  ]
}

抽取规则：
1. 同一字段重复出现时，互补内容合并，重复内容去重。
2. “角色画像”“客户情况”中出现的资方、担保主体、月供、逾期天数、融资期数、已还期数、累计逾期、历史最长逾期等内容，完整填写到 profile.customerSituation，并合并到“客户情况”维度 content。
3. profile.monthlyPayment 从“月供”提取；profile.totalInstallments 从“融资/贷款/总期数”提取；profile.paidInstallments 从“已还”提取；profile.debtDays 从“逾期 X 天”提取；profile.debtAmount 只有原文明示逾期金额/欠款金额时才填写，不能把月供当成逾期金额。
4. “触发原因”同时填写到 triggerReason 维度 content；如果是逾期/借款原因，也可汇总到 profile.debtReason。
5. “口头禅”“常说话术”“常用表达”“还款口头禅”“涉及还钱时经常说”等内容，填写到 profile.catchphrases，只保留客户会说的原话或短句，可用分号分隔多条。
6. “结束语提示词”只填写客户收尾阶段的原话或承诺到 profile.closingPrompt，不要改写成坐席话术；不要和 catchphrases 混淆。
7. “沟通表现”“车辆状态”“资产线索”“催收策略”分别填入同名维度 content。
8. 如果原文没有明确角色名称，可以基于整体画像生成一个短名称，例如“善意逾期提醒型”“短期周转配合型”；personalityType 生成一个更短类型标签，例如“善意逾期”。description 用一句话总结该客户画像。
9. dimensions 优先使用当前已有维度的 id；未匹配到的新增维度使用 dimension-1、dimension-2 递增。enabled 固定 true。`,
        prompt: `当前已有维度：
${
  existingDimensions.length > 0
    ? existingDimensions
        .map((dimension) => `- id=${dimension.id}; label=${dimension.label}`)
        .join('\n')
    : '- 未配置'
}

请识别并结构化下面的角色模板文本：

${text}`,
        temperature: 0.1,
      },
      'admin-parse-character-template',
    );

    const rawJson = extractJsonObject(typeof result.text === 'string' ? result.text : '');
    const parsed = applyCharacterTemplateTextFallbacks(
      normalizeTemplate(rawJson, existingDimensions),
      text,
    );

    if (!parsed.profile && !parsed.dimensions && !parsed.name && !parsed.description) {
      throw new Error('AI 未识别到有效角色模板信息');
    }

    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 识别角色模板失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
