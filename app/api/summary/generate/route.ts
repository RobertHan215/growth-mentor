import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { callLLM } from '@/lib/ai/llm';
import { resolveModelFromHeaders } from '@/lib/server/resolve-model';
import { getChatSessionsByStageId, getScenesByStageId, saveCourseSummary } from '@/lib/db';
import prisma from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { stageId } = await req.json();
    if (!stageId) {
      return NextResponse.json({ error: 'Missing stageId' }, { status: 400 });
    }

    // 1. Fetch Stage Info
    const stage = await prisma.stage.findUnique({
      where: { id: stageId },
    });
    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 });
    }

    // 2. Fetch all scenes to know the length of the course
    const scenes = await getScenesByStageId(stageId);

    // 3. Fetch all interactions (QA, Discussion, Training)
    const chatSessions = await getChatSessionsByStageId(stageId);
    
    // 4. Fetch Training Results if any
    const trainingResults = await prisma.trainingResult.findMany({
      where: { userId: session.user.id, stageId },
    });

    // Compile stats
    const stats = {
      totalScenes: scenes.length,
      questionsAsked: chatSessions.filter(s => s.type === 'qa').length,
      discussionsJoined: chatSessions.filter(s => s.type === 'discussion').length,
      trainingSessions: trainingResults.length,
      avgTrainingScore: trainingResults.length > 0
        ? trainingResults.reduce((sum, tr) => sum + tr.totalScore, 0) / trainingResults.length
        : undefined
    };

    // Prepare context for LLM
    let contextStr = `课程名称：${stage.name}\n课程描述：${stage.description || '无'}\n\n互动统计：\n问答：${stats.questionsAsked} 次\n讨论：${stats.discussionsJoined} 次\n对练：${stats.trainingSessions} 次\n\n`;
    
    if (trainingResults.length > 0) {
      contextStr += `对练记录：\n`;
      trainingResults.forEach((tr, i) => {
        contextStr += `[对练 ${i+1}] 评分：${tr.totalScore}，导师总结：${tr.summary}\n`;
      });
    }

    const qaSessions = chatSessions.filter(s => s.type === 'qa' || s.type === 'discussion');
    if (qaSessions.length > 0) {
      contextStr += `\n部分提问与讨论记录：\n`;
      // Take up to 10 latest interactions
      qaSessions.slice(0, 10).forEach(s => {
        const userMessages = s.messages.filter(m => (m as any).role === 'user');
        if (userMessages.length > 0) {
          contextStr += `- 话题/提问：${(userMessages[0] as any).content}\n`;
        }
      });
    }

    // 5. Call LLM to generate summary
    const systemPrompt = `你是一个专业的班主任兼学习顾问。用户刚刚学完了一门叫做《${stage.name}》的课程。
基于底下提供的用户历史互动记录，你需要生成一份结构化的个性化大总结。

用户的互动记录：
${contextStr}

请以 JSON 格式输出你的总结，必须完全遵循以下 TypeScript 接口的结构：
\`\`\`json
{
  "assessment": {
    "overallLevel": "beginner | intermediate | advanced",
    "strengths": ["用户的2-3个强项"],
    "improvements": ["需要提升的2-3个地方"],
    "keyInsights": ["学习过程中的关键收获或亮点表现"],
    "personalizedAdvice": "班主任给用户的专属建议（亲切、专业，100字左右）"
  },
  "highlights": [
    {
      "type": "question | training | discussion",
      "content": "用户的亮点行为（例如：提出了一个深度问题，或者在某次对话中表现出色）",
      "aiComment": "班主任的一句短评"
    }
  ]
}
\`\`\`
最多生成 3 个 highlights，如果没有特别好的 highlight 可以只写 1 个。
直接返回纯 JSON 对象，不要包括其他字符。`;

    const modelConfig = await resolveModelFromHeaders(req);
    const result = await callLLM(
      {
        model: modelConfig.model,
        system: systemPrompt,
        prompt: '请生成JSON格式的学习报告。',
        temperature: 0.6,
        maxTokens: 2000,
      },
      'summary-generation'
    );

    let contentStr = result.text;
    // Clean up markdown block if present
    contentStr = contentStr.replace(/^```json/m, '').replace(/```$/m, '').trim();
    
    let aiContent;
    try {
      aiContent = JSON.parse(contentStr);
    } catch (e) {
      console.error('Failed to parse summary JSON:', contentStr);
      return NextResponse.json({ error: 'Failed to generate valid summary' }, { status: 500 });
    }

    const finalContent = {
      courseName: stage.name,
      completedAt: Date.now(),
      stats,
      assessment: aiContent.assessment,
      highlights: aiContent.highlights || []
    };

    // 6. Save to database
    await saveCourseSummary({
      userId: session.user.id,
      stageId: stageId,
      content: finalContent
    });

    // 7. Update UserCourse status to 'completed'
    await prisma.userCourse.upsert({
      where: {
        userId_stageId: {
          userId: session.user.id,
          stageId: stageId
        }
      },
      update: {
        status: 'completed'
      },
      create: {
        userId: session.user.id,
        stageId: stageId,
        status: 'completed',
        source: 'self_selected'
      }
    });

    return NextResponse.json(finalContent);
  } catch (error) {
    console.error('Failed to generate course summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
