import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';

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

function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textFrom(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberFrom(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'AI 解析指标失败';
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text } = (await req.json()) as { text?: string };
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: '请输入用于提取指标的文本' }, { status: 400 });
    }

    const { model: languageModel } = await resolveModelFromHeaders(req);

    const systemPrompt = `你是一个专业的企业考评与绩效管理专家。你的任务是阅读用户提供的一段评分文档、考评要点或考核标准文本，并从中严格提取出结构化的【评分指标配置】。

配置有且仅有三层结构：
1. 一级指标 (Primary)
2. 二级指标 (Secondary)
3. 指标明细 (Detail) — 包含具体描述

请务必遵循以下规则：
1. 【严格忠实原文】：只提取输入文字中直接提到的评估要素、考核标准、考评要点与细则，绝不脑脑补或添加原文未提及的维度。
2. 【层级规整适应】：为了满足三层结构，若原文只有两层（例如只有一级和细则，无二级），你应当创建一个与一级同名或叫“基本要求”的二级指标作为过渡层，并将细则填入指标明细中。
3. 【权重提取与分摊】：仔细寻找原文中指出的分数、权重或占比（如百分比或绝对分值）。
   - 若原文中提到了具体的权重数字，请在对应指标的 weight 字段填入其对应的正整数值。
   - 若原文未提及任何权重数字，请根据指标相对重要性合理给出一个正整数（例如各子项平分权重）。请原样返回这些权重给用户，不要试图强制自动纠偏为 100，系统会原样回填至页面供用户微调。
4. 【评分模式】：每个一级指标必须返回 scoringMode。
   - 若该一级指标描述为加分、奖励、达标给分、正向得分，返回 "bonus"。
   - 若该一级指标描述为扣分、违规扣分、未达标扣分、负向扣减，返回 "deduction"。
   - 若原文没有明确说明，默认返回 "bonus"。
   - 二级指标和指标明细不需要单独返回 scoringMode，它们继承所属一级指标的模式。
5. 【输出格式】：只输出符合以下 JSON 格式的合法 JSON 对象，不要包含 markdown 的 \`\`\` 标记：

{
  "primary": [
    {
      "name": "一级指标名称",
      "scoringMode": "bonus 或 deduction",
      "weight": 50,
      "children": [
        {
          "name": "二级指标名称",
          "weight": 30,
          "details": [
            {
              "name": "指标明细名称",
              "weight": 30,
              "description": "明细具体的评分参考和行为锚点描述"
            }
          ]
        }
      ]
    }
  ]
}
`;

    const response = await callLLM(
      {
        model: languageModel,
        system: systemPrompt,
        prompt: `请解析以下考评文本，严格忠实原文提取出一级、二级指标、细则及权重：\n\n${text}`,
      },
      'ai-parse-criteria',
    );

    const rawJson = extractJsonObject(response.text);

    if (!isRecord(rawJson) || !Array.isArray(rawJson.primary)) {
      throw new Error('AI 返回的 JSON 结构无效，缺少 primary 数组');
    }

    const formattedPrimary = rawJson.primary.map((primaryValue) => {
      const p = isRecord(primaryValue) ? primaryValue : {};
      return {
        id: generateRandomId(),
        name: textFrom(p.name, '一级指标'),
        scoringMode: p.scoringMode === 'deduction' ? 'deduction' : 'bonus',
        weight: numberFrom(p.weight),
        children: arrayFrom(p.children).map((secondaryValue) => {
          const s = isRecord(secondaryValue) ? secondaryValue : {};
          return {
            id: generateRandomId(),
            name: textFrom(s.name, '二级指标'),
            weight: numberFrom(s.weight),
            details: arrayFrom(s.details).map((detailValue) => {
              const d = isRecord(detailValue) ? detailValue : {};
              return {
                id: generateRandomId(),
                name: textFrom(d.name, '指标细则'),
                weight: numberFrom(d.weight),
                description: textFrom(d.description, ''),
              };
            }),
          };
        }),
      };
    });

    const criteria = {
      version: 1,
      scoringMode: formattedPrimary[0]?.scoringMode || 'bonus',
      primary: formattedPrimary,
    };

    return NextResponse.json({ criteria });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
