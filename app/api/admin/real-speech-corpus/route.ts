import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { normalizeAsrPayload } from '@/lib/training/real-speech-library';

function adminOnly(session: { user?: { role?: string } } | null) {
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const corpora = await prisma.speechCorpus.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            turns: true,
            samples: true,
          },
        },
      },
      take: 100,
    });

    return NextResponse.json({ corpora });
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载真实话术素材失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const body = await req.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }

    const payload = body.payload;
    const name =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : `ASR 话术素材 ${new Date().toLocaleString('zh-CN')}`;
    const normalized = normalizeAsrPayload(payload);
    const corpusId = randomUUID();

    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.speechCorpus.create({
        data: {
          id: corpusId,
          name,
          sourceType: 'asr_json',
          status: 'imported',
          count: normalized.count,
          fullText: normalized.fullText,
          dialogueText: normalized.dialogueText,
          rawJson: normalized.rawJson as Prisma.InputJsonValue,
          speakerMap: { customer: '客户', agent: '催收员' },
          createdBy: userId,
        },
      });

      await tx.speechTurn.createMany({
        data: normalized.turns.map((turn) => ({
          corpusId,
          order: turn.order,
          speaker: turn.speaker,
          role: turn.role,
          text: turn.text,
          startTime: turn.startTime,
          endTime: turn.endTime,
        })),
      });
    });

    const corpus = await prisma.speechCorpus.findUnique({
      where: { id: corpusId },
      include: {
        _count: {
          select: {
            turns: true,
            samples: true,
          },
        },
      },
    });

    return NextResponse.json({ corpus });
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入 ASR JSON 失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
