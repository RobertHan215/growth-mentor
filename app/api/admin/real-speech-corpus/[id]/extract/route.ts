import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import {
  extractCustomerSpeechSamplesFromTurns,
  type NormalizedSpeechTurn,
} from '@/lib/training/real-speech-library';

function adminOnly(session: { user?: { role?: string } } | null) {
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function resolveTemplateId(body: { templateId?: unknown; templateIds?: unknown }): string | null {
  return stringValue(body.templateId) ?? stringArray(body.templateIds)[0] ?? null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const templateId = resolveTemplateId(body as { templateId?: unknown; templateIds?: unknown });

    const turns = await prisma.speechTurn.findMany({
      where: { corpusId: id },
      orderBy: { order: 'asc' },
    });

    if (turns.length === 0) {
      return NextResponse.json({ error: '该素材没有可抽取的对话轮次' }, { status: 400 });
    }

    const corpus = await prisma.speechCorpus.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!corpus || corpus.status === 'imported') {
      return NextResponse.json(
        { error: '请先确认客户和催收员身份，再抽取客户话术' },
        { status: 400 },
      );
    }

    const normalizedTurns: NormalizedSpeechTurn[] = turns.map((turn) => ({
      order: turn.order,
      speaker: turn.speaker === 'customer' ? 'customer' : 'agent',
      role: turn.role === 'customer' ? 'customer' : 'agent',
      text: turn.text,
      startTime: turn.startTime,
      endTime: turn.endTime,
    }));

    const extracted = extractCustomerSpeechSamplesFromTurns(normalizedTurns);

    const validTemplateId = templateId
      ? (
          await prisma.aiCharacterTemplate.findUnique({
            where: { id: templateId },
            select: { id: true },
          })
        )?.id ?? null
      : null;

    await prisma.$transaction(async (tx) => {
      await tx.customerSpeechSample.deleteMany({ where: { corpusId: id } });

      for (const sample of extracted) {
        const created = await tx.customerSpeechSample.create({
          data: {
            corpusId: id,
            collectorPrompt: sample.collectorPrompt,
            customerLine: sample.customerLine,
            sanitizedCustomerLine: sample.sanitizedCustomerLine,
            triggerAction: sample.triggerAction,
            customerIntent: sample.customerIntent,
            emotion: sample.emotion,
            strategy: sample.strategy,
            pressureLevel: sample.pressureLevel,
            dialogueStage: sample.dialogueStage,
            qualityScore: sample.qualityScore,
            sourceTurnOrder: sample.sourceTurnOrder,
          },
        });

        if (validTemplateId) {
          await tx.customerSpeechSampleTemplate.createMany({
            data: [{
              sampleId: created.id,
              templateId: validTemplateId,
            }],
            skipDuplicates: true,
          });
        }
      }

      await tx.speechCorpus.update({
        where: { id },
        data: { status: 'processed' },
      });
    });

    return NextResponse.json({
      extracted: extracted.length,
      templateBinding: Boolean(validTemplateId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '抽取客户话术失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
