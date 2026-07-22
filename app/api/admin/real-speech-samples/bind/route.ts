import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

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

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const body = await req.json();
    const sampleIds = stringArray((body as { sampleIds?: unknown }).sampleIds);
    const templateId = resolveTemplateId(body as { templateId?: unknown; templateIds?: unknown });

    if (sampleIds.length === 0) {
      return NextResponse.json({ error: '请选择需要绑定的样本' }, { status: 400 });
    }

    if (templateId) {
      const template = await prisma.aiCharacterTemplate.findUnique({
        where: { id: templateId },
        select: { id: true },
      });

      if (!template) {
        return NextResponse.json({ error: '角色模板不存在' }, { status: 400 });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.customerSpeechSampleTemplate.deleteMany({
        where: { sampleId: { in: sampleIds } },
      });

      if (templateId) {
        await tx.customerSpeechSampleTemplate.createMany({
          data: sampleIds.map((sampleId) => ({
            sampleId,
            templateId,
          })),
          skipDuplicates: true,
        });
      }
    });

    return NextResponse.json({
      success: true,
      boundCount: templateId ? sampleIds.length : 0,
      templateId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '绑定角色模板失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
