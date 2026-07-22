import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { sanitizeSensitiveText } from '@/lib/training/real-speech-library';

function adminOnly(session: { user?: { role?: string } } | null) {
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
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
    const body = await req.json();
    const { enabled, templateId, customerLine } = body as {
      enabled?: unknown;
      templateId?: unknown;
      customerLine?: unknown;
    };

    const dataToUpdate: any = {};
    if (typeof enabled === 'boolean') {
      dataToUpdate.enabled = enabled;
    }
    if (typeof customerLine === 'string') {
      dataToUpdate.customerLine = customerLine.trim();
      dataToUpdate.sanitizedCustomerLine = sanitizeSensitiveText(customerLine.trim());
    }

    let templateIdToUpdate: string | null | undefined = undefined;
    if (templateId !== undefined) {
      if (templateId === null || (typeof templateId === 'string' && templateId.trim() === '')) {
        templateIdToUpdate = null;
      } else if (typeof templateId === 'string') {
        templateIdToUpdate = templateId.trim();
        const template = await prisma.aiCharacterTemplate.findUnique({
          where: { id: templateIdToUpdate },
          select: { id: true },
        });
        if (!template) {
          return NextResponse.json({ error: '角色模板不存在' }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: 'templateId 必须是字符串或 null' }, { status: 400 });
      }
    }

    if (Object.keys(dataToUpdate).length === 0 && templateIdToUpdate === undefined) {
      return NextResponse.json({ error: '请提供要更新的字段' }, { status: 400 });
    }

    const sample = await prisma.$transaction(async (tx) => {
      let updatedSample = null;
      if (Object.keys(dataToUpdate).length > 0) {
        updatedSample = await tx.customerSpeechSample.update({
          where: { id },
          data: dataToUpdate,
        });
      }

      if (templateIdToUpdate !== undefined) {
        await tx.customerSpeechSampleTemplate.deleteMany({
          where: { sampleId: id },
        });

        if (templateIdToUpdate !== null) {
          await tx.customerSpeechSampleTemplate.create({
            data: {
              sampleId: id,
              templateId: templateIdToUpdate,
            },
          });
        }
      }

      return updatedSample || await tx.customerSpeechSample.findUnique({ where: { id } });
    });

    return NextResponse.json({ sample });
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新样本失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
