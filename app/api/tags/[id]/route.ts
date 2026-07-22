import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, color } = await req.json();
    const tag = await prisma.tag.update({
      where: { id },
      data: { name, color }
    });

    return NextResponse.json(tag);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stageOneOnOneCount = await prisma.stage.count({
      where: { oneOnOneTagId: id }
    });

    if (stageOneOnOneCount > 0) {
      return NextResponse.json({ error: '该标签已被课程的一对一评分配置引用，无法删除' }, { status: 400 });
    }

    const stageTagCount = await prisma.stageTag.count({
      where: { tagId: id }
    });

    if (stageTagCount > 0) {
      return NextResponse.json({ error: '该标签已与课程建立关联，无法删除' }, { status: 400 });
    }

    const scoringConfigCount = await prisma.oneOnOneScoringConfig.count({
      where: { tagId: id }
    });

    if (scoringConfigCount > 0) {
      return NextResponse.json({ error: '该标签存在关联的一对一评分配置，请先删除评分配置' }, { status: 400 });
    }

    await prisma.tag.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
