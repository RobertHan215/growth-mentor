import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelWithDefaults } from '@/lib/server/resolve-model';
import type { CharacterDimension } from '@/lib/types/ai-character-template';

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

function normalizeExtractedDimensions(
  value: unknown,
  existing: CharacterDimension[],
): CharacterDimension[] {
  const source = isRecord(value) && Array.isArray(value.dimensions) ? value.dimensions : [];
  const existingByLabel = new Map(existing.map((dimension) => [dimension.label, dimension]));

  return source
    .map((item, index) => {
      if (!isRecord(item)) return null;

      const label = stringValue(item.label);
      if (!label) return null;

      const matchedExisting = existingByLabel.get(label);

      return {
        id: stringValue(item.id) || matchedExisting?.id || `dimension-${index + 1}`,
        label,
        description: stringValue(item.description) || matchedExisting?.description || label,
        content: stringValue(item.content) || matchedExisting?.content || '',
        order: index + 1,
        enabled: booleanValue(item.enabled, matchedExisting?.enabled ?? true),
      };
    })
    .filter((item): item is CharacterDimension => item !== null)
    .slice(0, 20);
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
      return NextResponse.json({ error: '请输入需要提取的维度文本' }, { status: 400 });
    }

    const existingDimensions = normalizeExistingDimensions(body.dimensions);
    const { model } = await resolveModelWithDefaults({});

    const result = await callLLM(
      {
        model,
        system: `你是一个信息抽取专家，负责从用户粘贴的文本中提取【角色模板维度配置】。

这些维度用于 AI 客户角色扮演，不是评分标准。你只做抽取和结构化，不要生成原文没有表达的新维度。

输出必须是严格 JSON，不要包含 Markdown 代码块或解释文字：
{
  "dimensions": [
    {
      "id": "dimension-1",
      "label": "维度名称",
      "description": "维度描述",
      "content": "维度内容",
      "enabled": true
    }
  ]
}

抽取规则：
1. 严格忠实原文，只提取文本里明确出现的维度、维度描述和维度内容。
2. label 填维度名称，例如“触发原因”“沟通表现”“车辆状态”。
3. description 填该维度的说明、定义或用途；如果原文没有单独描述，可用一句话概括该维度在原文中的含义。
4. content 填该维度下的具体内容、示例、角色设定或业务细节；不要空泛改写。
5. 如果原文只有“维度名：内容”，description 可以简短概括，content 保留冒号后的具体内容。
6. 如果当前已有维度中存在同名 label，优先沿用它的 id；否则 id 用 dimension-1、dimension-2 递增。
7. enabled 固定返回 true。`,
        prompt: `当前已有维度：
${
  existingDimensions.length > 0
    ? existingDimensions
        .map((dimension) => `- id=${dimension.id}; label=${dimension.label}`)
        .join('\n')
    : '- 未配置'
}

请从下面文本中提取维度配置：

${text}`,
        temperature: 0.1,
      },
      'admin-extract-character-dimensions',
    );

    const rawJson = extractJsonObject(typeof result.text === 'string' ? result.text : '');
    const dimensions = normalizeExtractedDimensions(rawJson, existingDimensions);

    if (dimensions.length === 0) {
      throw new Error('AI 未提取到有效维度');
    }

    return NextResponse.json({ dimensions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 提取维度失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
