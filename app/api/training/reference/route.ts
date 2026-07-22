import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { prisma } from '@/lib/db';

/**
 * POST /api/training/reference — Extract reference material from course content
 *
 * Returns structured key points, reference scripts, and standard answers.
 * Caches the result in the Stage's directorConfig.oneOnOneReference field
 * so subsequent requests return instantly.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { courseContent, courseName, stageId } = (await req.json()) as {
      courseContent: string;
      courseName?: string;
      stageId?: string;
    };

    if (!courseContent) {
      return NextResponse.json({ error: 'courseContent is required' }, { status: 400 });
    }

    // ── Check cache ──
    if (stageId) {
      try {
        const stage = await prisma.stage.findUnique({
          where: { id: stageId },
          select: { directorConfig: true },
        });
        const cached = (stage?.directorConfig as Record<string, unknown>)?.oneOnOneReference;
        if (cached && typeof cached === 'object') {
          return NextResponse.json(cached);
        }
      } catch {
        // Cache miss, continue to generate
      }
    }

    // ── Generate ──
    const systemPrompt = `你是一位教学专家。请分析以下课程内容，提取出用于一对一对练的参考资料。

## 你需要提取的内容：

1. **关键知识点** (keyPoints): 3-6 个核心知识点，每个包含标题和简要说明
2. **参考话术** (scripts): 2-4 条常见场景下的参考沟通话术，每条包含场景描述和建议回复
3. **标准答案** (standardAnswers): 2-4 个可能被问到的问题及其标准答案

## 输出格式（严格 JSON）：
{
  "keyPoints": [
    { "title": "知识点标题", "content": "知识点说明" }
  ],
  "scripts": [
    { "situation": "当客户问到...", "response": "建议这样回答：..." }
  ],
  "standardAnswers": [
    { "question": "可能的问题", "answer": "标准答案" }
  ]
}

请严格按 JSON 格式输出，不要输出任何其他内容。`;

    const { model: languageModel } = await resolveModelFromHeaders(req);

    const result = await callLLM(
      {
        model: languageModel,
        system: systemPrompt,
        prompt: `## 课程名称\n${courseName || '未命名课程'}\n\n## 课程内容\n${courseContent.slice(0, 8000)}`,
      },
      'training-reference',
    );

    let referenceData;
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      const parsed = JSON.parse(jsonMatch[0]);
      referenceData = {
        keyPoints: parsed.keyPoints || [],
        scripts: parsed.scripts || [],
        standardAnswers: parsed.standardAnswers || [],
      };
    } catch {
      referenceData = {
        keyPoints: [{ title: '课程概述', content: courseContent.slice(0, 200) + '...' }],
        scripts: [],
        standardAnswers: [],
      };
    }

    // ── Save to cache ──
    if (stageId) {
      try {
        const stage = await prisma.stage.findUnique({
          where: { id: stageId },
          select: { directorConfig: true },
        });
        const existingConfig = (stage?.directorConfig as Record<string, unknown>) || {};
        await prisma.stage.update({
          where: { id: stageId },
          data: {
            directorConfig: {
              ...existingConfig,
              oneOnOneReference: referenceData,
            },
          },
        });
      } catch (cacheErr) {
        // Non-fatal — just log
        console.warn('[training/reference] Failed to cache:', cacheErr);
      }
    }

    return NextResponse.json(referenceData);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
