import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

function adminOnly(session: { user?: { role?: string } } | null) {
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const { id } = await params;
    const corpus = await prisma.speechCorpus.findUnique({
      where: { id },
      include: {
        turns: {
          orderBy: { order: 'asc' },
        },
        samples: {
          orderBy: [{ qualityScore: 'desc' }, { createdAt: 'desc' }],
          include: {
            templateBindings: {
              include: {
                template: {
                  select: {
                    id: true,
                    name: true,
                    personalityType: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!corpus) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ corpus });
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载真实话术素材详情失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseRole(value: unknown): 'customer' | 'agent' | null {
  return value === 'customer' || value === 'agent' ? value : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const { id } = await params;
    const body = (await req.json()) as { rolesByTurnId?: unknown; textsByTurnId?: unknown };
    const rolesByTurnId =
      typeof body.rolesByTurnId === 'object' && body.rolesByTurnId !== null
        ? (body.rolesByTurnId as Record<string, unknown>)
        : {};
    const textsByTurnId =
      typeof body.textsByTurnId === 'object' && body.textsByTurnId !== null
        ? (body.textsByTurnId as Record<string, string>)
        : {};

    const turns = await prisma.speechTurn.findMany({
      where: { corpusId: id },
      select: { id: true },
    });

    if (turns.length === 0) {
      return NextResponse.json({ error: '该素材没有可确认的对话轮次' }, { status: 400 });
    }

    const validTurnIds = new Set(turns.map((turn) => turn.id));
    const updates = Object.entries(rolesByTurnId)
      .map(([turnId, rawRole]) => ({ turnId, role: parseRole(rawRole) }))
      .filter(
        (item): item is { turnId: string; role: 'customer' | 'agent' } =>
          validTurnIds.has(item.turnId) && item.role !== null,
      );

    if (updates.length !== turns.length) {
      return NextResponse.json({ error: '请为每一轮对话确认身份' }, { status: 400 });
    }

    const roleCounts = updates.reduce(
      (acc, item) => {
        acc[item.role] += 1;
        return acc;
      },
      { customer: 0, agent: 0 },
    );

    if (roleCounts.customer === 0 || roleCounts.agent === 0) {
      return NextResponse.json(
        { error: '必须同时包含客户和催收员两种身份' },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        const newText = typeof textsByTurnId[update.turnId] === 'string'
          ? textsByTurnId[update.turnId].trim()
          : undefined;

        await tx.speechTurn.update({
          where: { id: update.turnId },
          data: {
            speaker: update.role,
            role: update.role,
            ...(newText !== undefined ? { text: newText } : {}),
          },
        });
      }

      await tx.customerSpeechSample.deleteMany({ where: { corpusId: id } });

      const updatedTurns = await tx.speechTurn.findMany({
        where: { corpusId: id },
        orderBy: { order: 'asc' },
      });
      const dialogueText = updatedTurns
        .map((turn) => `${turn.role === 'customer' ? '客户' : '催收员'}：${turn.text}`)
        .join('\n');

      await tx.speechCorpus.update({
        where: { id },
        data: {
          status: 'speaker_confirmed',
          dialogueText,
          speakerMap: {
            customer: '客户',
            agent: '催收员',
            confirmedAt: new Date().toISOString(),
            replacedOriginalSpeaker: true,
            roleCounts,
          } satisfies Prisma.InputJsonValue,
        },
      });
    });

    return NextResponse.json({
      success: true,
      roleCounts,
      samplesCleared: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存说话人身份失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const { id } = await params;
    await prisma.speechCorpus.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除真实话术素材失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
