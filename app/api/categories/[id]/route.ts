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

    const { name, parentId } = await req.json();
    const category = await prisma.category.update({
      where: { id },
      data: {
        name,
        parentId: parentId || null
      }
    });

    return NextResponse.json(category);
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

    const childCount = await prisma.category.count({
      where: { parentId: id }
    });

    if (childCount > 0) {
      return NextResponse.json({ error: '该分类下存在子分类，请先转移或删除子分类' }, { status: 400 });
    }

    const stageCount = await prisma.stage.count({
      where: { categoryId: id }
    });

    if (stageCount > 0) {
      return NextResponse.json({ error: '该分类下存在关联课程，请先转移或删除课程' }, { status: 400 });
    }

    await prisma.category.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
