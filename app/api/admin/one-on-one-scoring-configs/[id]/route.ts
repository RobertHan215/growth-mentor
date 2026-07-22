import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {
  deleteOneOnOneScoringConfig,
  updateOneOnOneScoringConfig,
} from '@/lib/server/one-on-one-scoring-config';

function adminOnly(session: Awaited<ReturnType<typeof getServerSession>>) {
  const role = (session as { user?: { role?: string } } | null)?.user?.role;
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败';
}

function prismaErrorCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : null;
}

function errorResponse(error: unknown) {
  const code = prismaErrorCode(error);
  if (code === 'P2025') {
    return NextResponse.json({ error: '评分配置不存在' }, { status: 404 });
  }
  if (code === 'P2002') {
    return NextResponse.json({ error: '该标签已存在评分配置' }, { status: 409 });
  }
  return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const { id } = await params;
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!name) {
      return NextResponse.json({ error: '请输入评分配置名称' }, { status: 400 });
    }

    const config = await updateOneOnOneScoringConfig(id, { ...body, name });
    return NextResponse.json(config);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const { id } = await params;
    await deleteOneOnOneScoringConfig(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
