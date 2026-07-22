import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {
  createOneOnOneScoringConfig,
  getOneOnOneScoringConfigByTag,
  listOneOnOneScoringConfigs,
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

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const tagId = searchParams.get('tagId');
  if (tagId) {
    return NextResponse.json(await getOneOnOneScoringConfigByTag(tagId));
  }

  return NextResponse.json(await listOneOnOneScoringConfigs());
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const guard = adminOnly(session);
  if (guard) return guard;

  try {
    const body = await req.json();
    const tagId = typeof body.tagId === 'string' ? body.tagId.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!tagId) {
      return NextResponse.json({ error: '请选择标签' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: '请输入评分配置名称' }, { status: 400 });
    }

    const config = await createOneOnOneScoringConfig({ ...body, tagId, name });
    return NextResponse.json(config);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: '该标签已存在评分配置' }, { status: 409 });
    }
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
